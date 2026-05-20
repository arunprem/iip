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

from iip_core.auth import CurrentUser, get_current_user, require_role
from iip_core.db import AsyncSession, get_db
from iip_core.errors import NotFoundError
from iip_core.logging import get_logger
from iip_core.settings import ClassificationLevel

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
    """List all IIP users — admin role required."""
    # TODO: Implement UserRepository.list() with pagination
    logger.info("users_list_requested", page=page, page_size=page_size)
    return UserListResponse(users=[], total=0, page=page, page_size=page_size)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Create a new IIP user — admin role required. Emits audit event."""
    # TODO: Implement UserRepository.create() + AuditLogger.log(USER_CREATED)
    logger.info("user_create_requested", username=payload.username, by=current_user.username)
    raise NotFoundError("Feature", "user-create-not-yet-implemented")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Get a single user's profile. Users can view their own; admins can view all."""
    # TODO: Implement UserRepository.get_by_id()
    raise NotFoundError("User", user_id)


@router.post("/{user_id}/roles", status_code=status.HTTP_201_CREATED)
async def assign_role(
    user_id: str,
    payload: AssignRoleRequest,
    current_user: Annotated[CurrentUser, Depends(require_role("SYSTEM_ADMIN"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Assign a role to a user — records justification and emits audit event."""
    # TODO: Implement RoleRepository.assign() + AuditLogger.log(ROLE_ASSIGNED)
    logger.info(
        "role_assignment_requested",
        target_user_id=user_id,
        role=payload.role_name,
        by=current_user.username,
        justification=payload.justification,
    )
    return {"message": f"Role '{payload.role_name}' assignment queued for user {user_id}"}
