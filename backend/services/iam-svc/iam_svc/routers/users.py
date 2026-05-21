"""
IAM Service — Users Router.

Handles:
  - GET    /                 : List all users (paginated)
  - POST   /                 : Create a new user
  - GET    /{user_id}        : Get user by ID
  - PATCH  /{user_id}        : Update user attributes
  - DELETE /{user_id}        : Deactivate user
  - GET    /{user_id}/roles  : Get user's assigned roles
  - POST   /{user_id}/roles  : Assign a role to a user
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, EmailStr

from iip_core.auth import CurrentUser, get_current_user, require_role, hash_password
from iip_core.db import AsyncSession, get_db
from iip_core.errors import NotFoundError
from iip_core.logging import get_logger
from iip_core.settings import ClassificationLevel
from iam_svc.models.user import User
from iam_svc.repositories.user_repository import UserRepository
from iam_svc.repositories.role_repository import RoleRepository

router = APIRouter()
logger = get_logger(__name__)


# ─── Models ───────────────────────────────────────────────────────────────────


class CreateUserRequest(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    badge_number: str
    department: str
    clearance_level: ClassificationLevel = ClassificationLevel.UNCLASSIFIED
    roles: list[str] = []


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: str
    badge_number: str
    department: str
    clearance_level: str
    roles: list[str]
    is_active: bool


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    page_size: int


class AssignRoleRequest(BaseModel):
    role_name: str
    granted_by: str
    justification: str


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.get("/", response_model=UserListResponse)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> UserListResponse:
    repo = UserRepository(db)
    users_db, total = await repo.list_users(page, page_size)
    
    users = []
    for u in users_db:
        users.append(UserResponse(
            user_id=str(u.id),
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            badge_number=u.badge_number,
            department=u.department,
            clearance_level=u.clearance_level,
            roles=[r.role_name for r in u.roles],
            is_active=u.is_active,
        ))

    logger.info("users_list_requested", page=page, page_size=page_size)
    return UserListResponse(users=users, total=total, page=page, page_size=page_size)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    repo = UserRepository(db)
    
    new_user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        badge_number=payload.badge_number,
        department=payload.department,
        password_hash=hash_password("TemporaryPassword123!"),  # Placeholder
        clearance_level=payload.clearance_level.value,
        is_active=True,
    )
    
    # We aren't doing role assignment here directly yet, the roles route handles it.
    created_user = await repo.create(new_user)
    
    logger.info("user_create_requested", username=payload.username, by=current_user.username)
    
    return UserResponse(
        user_id=str(created_user.id),
        username=created_user.username,
        email=created_user.email,
        full_name=created_user.full_name,
        badge_number=created_user.badge_number,
        department=created_user.department,
        clearance_level=created_user.clearance_level,
        roles=[],
        is_active=created_user.is_active,
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    repo = UserRepository(db)
    user = await repo.get_by_id_or_error(user_id)
    
    return UserResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        badge_number=user.badge_number,
        department=user.department,
        clearance_level=user.clearance_level,
        roles=[r.role_name for r in user.roles],
        is_active=user.is_active,
    )


@router.post("/{user_id}/roles", status_code=status.HTTP_201_CREATED)
async def assign_role(
    user_id: str,
    payload: AssignRoleRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    user_repo = UserRepository(db)
    role_repo = RoleRepository(db)
    
    user = await user_repo.get_by_id_or_error(user_id)
    role = await role_repo.get_by_name_or_error(payload.role_name)
    
    await user_repo.assign_role(user, role, granted_by=current_user.user_id, justification=payload.justification)

    logger.info(
        "role_assignment_success",
        target_user_id=user_id,
        role=payload.role_name,
        by=current_user.username,
        justification=payload.justification,
    )
    return {"message": f"Role '{payload.role_name}' assigned to user {user_id}"}
