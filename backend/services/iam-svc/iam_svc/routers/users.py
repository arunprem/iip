"""IAM user administration — profile CRUD and per-office role assignments."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, EmailStr, Field

from iip_core.auth import CurrentUser, hash_password
from iip_core.db import AsyncSession, get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, ClassificationLevel, get_settings
from iam_svc.services.keycloak_sync import set_user_enabled, sync_user_credentials
from iam_svc.dependencies import get_current_user_db, require_system_admin_role
from iam_svc.models.role import Role
from iam_svc.models.user import User
from iam_svc.repositories.office_repository import OfficeRepository
from iam_svc.repositories.role_repository import RoleRepository
from iam_svc.repositories.user_repository import UserRepository

router = APIRouter()
logger = get_logger(__name__)

ADMIN_OFFICE_ROLE_NAMES = frozenset({"SYSTEM_ADMIN", "IT_ADMIN"})


class OfficeAssignmentInput(BaseModel):
    office_id: str
    role_id: str


class OfficeAssignmentResponse(BaseModel):
    office_id: str
    office_code: str
    office_name: str
    role_id: str
    role_name: str


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: str
    badge_number: str
    department: str
    clearance_level: str
    is_active: bool
    legacy_roles: list[str] = Field(
        default_factory=list,
        description="Global roles from iam.user_roles (legacy bootstrap)",
    )
    office_assignments: list[OfficeAssignmentResponse] = Field(default_factory=list)


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    page_size: int


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    badge_number: str = Field(min_length=1, max_length=50)
    department: str = Field(min_length=1, max_length=255)
    clearance_level: ClassificationLevel = ClassificationLevel.UNCLASSIFIED
    password: str | None = Field(
        None,
        min_length=8,
        max_length=128,
        description="Optional. A temporary password is generated if omitted.",
    )
    office_assignments: list[OfficeAssignmentInput] = Field(default_factory=list)


class UpdateUserRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(None, min_length=1, max_length=255)
    badge_number: str | None = Field(None, min_length=1, max_length=50)
    department: str | None = Field(None, min_length=1, max_length=255)
    clearance_level: ClassificationLevel | None = None
    password: str | None = Field(None, min_length=8, max_length=128)
    office_assignments: list[OfficeAssignmentInput] | None = None


class CreateUserResponse(UserResponse):
    initial_password: str | None = None


def _assignment_to_response(assignment) -> OfficeAssignmentResponse:
    return OfficeAssignmentResponse(
        office_id=str(assignment.office_id),
        office_code=assignment.office.office_code,
        office_name=assignment.office.office_name,
        role_id=str(assignment.role_id),
        role_name=assignment.role.role_name,
    )


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        badge_number=user.badge_number,
        department=user.department,
        clearance_level=user.clearance_level,
        is_active=user.is_active,
        legacy_roles=[r.role_name for r in user.roles],
        office_assignments=[
            _assignment_to_response(a) for a in user.office_assignments
        ],
    )


async def _validate_unique_fields(
    repo: UserRepository,
    *,
    username: str | None = None,
    email: str | None = None,
    badge_number: str | None = None,
    exclude_user_id: uuid.UUID | None = None,
) -> None:
    if username:
        existing = await repo.get_by_username(username)
        if existing and (exclude_user_id is None or existing.id != exclude_user_id):
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Username '{username}' is already in use.",
                meta={"field": "username"},
            )
    if email:
        existing = await repo.get_by_email(email)
        if existing and (exclude_user_id is None or existing.id != exclude_user_id):
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Email '{email}' is already in use.",
                meta={"field": "email"},
            )
    if badge_number:
        existing = await repo.get_by_badge(badge_number)
        if existing and (exclude_user_id is None or existing.id != exclude_user_id):
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"PEN number '{badge_number}' is already in use.",
                meta={"field": "badge_number"},
            )


async def _resolve_office_assignments(
    db: AsyncSession,
    items: list[OfficeAssignmentInput],
) -> list[tuple[uuid.UUID, uuid.UUID]]:
    if not items:
        return []

    office_repo = OfficeRepository(db)
    role_repo = RoleRepository(db)
    resolved: list[tuple[uuid.UUID, uuid.UUID]] = []

    for item in items:
        try:
            office_id = uuid.UUID(item.office_id)
            role_id = uuid.UUID(item.role_id)
        except ValueError as exc:
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail="Invalid office or role id.",
            ) from exc

        office = await office_repo.get_by_id(office_id)
        if not office or not office.is_active:
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Office {item.office_id} not found or inactive.",
                meta={"field": "office_id"},
            )

        role = await role_repo.get_by_id(role_id)
        if not role:
            raise IIPException(
                status_code=400,
                error_code=ErrorCode.VALIDATION_ERROR,
                detail=f"Role {item.role_id} not found.",
                meta={"field": "role_id"},
            )

        resolved.append((office_id, role_id))

    return resolved


async def _guard_admin_office_assignments(
    db: AsyncSession,
    user: User,
    resolved: list[tuple[uuid.UUID, uuid.UUID]],
) -> None:
    """Users with legacy SYSTEM_ADMIN/IT_ADMIN must keep an office-scoped admin role."""
    has_global_admin = any(r.role_name in ADMIN_OFFICE_ROLE_NAMES for r in user.roles)
    if not has_global_admin:
        return

    role_repo = RoleRepository(db)
    admin_role_ids: set[uuid.UUID] = set()
    for name in ADMIN_OFFICE_ROLE_NAMES:
        role = await role_repo.get_by_name(name)
        if role:
            admin_role_ids.add(role.id)

    if any(role_id in admin_role_ids for _, role_id in resolved):
        return

    raise IIPException(
        status_code=400,
        error_code=ErrorCode.VALIDATION_ERROR,
        detail=(
            "This account has global system administrator privileges. "
            "Assign at least one office with the SYSTEM_ADMIN or IT_ADMIN role "
            "so administration menus remain available when that office is selected."
        ),
        meta={"field": "office_assignments"},
    )


@router.get("/", response_model=UserListResponse)
async def list_users(
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    q: str | None = Query(None, max_length=200),
    active_only: bool | None = Query(None),
) -> UserListResponse:
    repo = UserRepository(db)
    users_db, total = await repo.list_users(
        page=page, page_size=page_size, q=q, active_only=active_only
    )
    return UserListResponse(
        users=[_user_to_response(u) for u in users_db],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/", response_model=CreateUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> CreateUserResponse:
    repo = UserRepository(db)
    username = payload.username.strip()
    await _validate_unique_fields(
        repo,
        username=username,
        email=str(payload.email),
        badge_number=payload.badge_number.strip(),
    )

    initial_password: str | None = None
    plain_password = payload.password
    if not plain_password:
        plain_password = repo.generate_temp_password()
        initial_password = plain_password

    new_user = User(
        username=username,
        email=str(payload.email).strip(),
        full_name=payload.full_name.strip(),
        badge_number=payload.badge_number.strip(),
        department=payload.department.strip(),
        password_hash=hash_password(plain_password),
        clearance_level=payload.clearance_level.value,
        is_active=True,
    )
    created = await repo.create(new_user)

    assignments = await _resolve_office_assignments(db, payload.office_assignments)
    if assignments:
        await _guard_admin_office_assignments(db, created, assignments)
        try:
            await repo.replace_office_assignments(created.id, assignments)
        except ValueError as exc:
            if str(exc) == "duplicate_office":
                raise IIPException(
                    status_code=400,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="Each office may only appear once per user.",
                    meta={"field": "office_assignments"},
                ) from exc
            raise
        created = await repo.get_by_id_or_error(created.id)

    await sync_user_credentials(settings, created, plain_password)

    logger.info("user_created", username=username, by=current_user.username)
    base = _user_to_response(created)
    return CreateUserResponse(**base.model_dump(), initial_password=initial_password)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    user = await UserRepository(db).get_by_id_or_error(user_id)
    return _user_to_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> UserResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(user_id)
    user_uuid = user.id

    if payload.email is not None:
        await _validate_unique_fields(
            repo, email=str(payload.email), exclude_user_id=user_uuid
        )
        user.email = str(payload.email).strip()
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.badge_number is not None:
        await _validate_unique_fields(
            repo, badge_number=payload.badge_number.strip(), exclude_user_id=user_uuid
        )
        user.badge_number = payload.badge_number.strip()
    if payload.department is not None:
        user.department = payload.department.strip()
    if payload.clearance_level is not None:
        user.clearance_level = payload.clearance_level.value
    password_to_sync: str | None = None
    if payload.password:
        user.password_hash = hash_password(payload.password)
        password_to_sync = payload.password

    if payload.office_assignments is not None:
        assignments = await _resolve_office_assignments(db, payload.office_assignments)
        await _guard_admin_office_assignments(db, user, assignments)
        try:
            await repo.replace_office_assignments(user_uuid, assignments)
        except ValueError as exc:
            if str(exc) == "duplicate_office":
                raise IIPException(
                    status_code=400,
                    error_code=ErrorCode.VALIDATION_ERROR,
                    detail="Each office may only appear once per user.",
                    meta={"field": "office_assignments"},
                ) from exc
            raise

    updated = await repo.update(user)
    if password_to_sync:
        await sync_user_credentials(settings, updated, password_to_sync)
    logger.info("user_updated", user_id=user_id, by=current_user.username)
    return _user_to_response(updated)


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> UserResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(user_id)
    user.is_active = True
    updated = await repo.update(user)
    await set_user_enabled(settings, updated.username, True)
    logger.info("user_activated", user_id=user_id, by=current_user.username)
    return _user_to_response(updated)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user_db)],
    _: Annotated[Role, Depends(require_system_admin_role)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[BaseServiceSettings, Depends(get_settings)],
) -> UserResponse:
    if str(current_user.user_id) == user_id:
        raise IIPException(
            status_code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            detail="You cannot deactivate your own account.",
        )
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(user_id)
    user.is_active = False
    updated = await repo.update(user)
    await set_user_enabled(settings, updated.username, False)
    logger.info("user_deactivated", user_id=user_id, by=current_user.username)
    return _user_to_response(updated)
