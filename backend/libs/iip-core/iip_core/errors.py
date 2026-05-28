"""
IIP Core — Standard API Error Models.

Provides consistent HTTP error response payloads across all IIP services.
Every error is structured with a type code, human-readable detail, and optional
trace information for correlation in audit logs.
"""

from __future__ import annotations

from enum import StrEnum
import numbers
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorCode(StrEnum):
    """Canonical IIP error codes for machine-readable error identification."""

    # Authentication / Authorization
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CLEARANCE_INSUFFICIENT = "CLEARANCE_INSUFFICIENT"
    JIT_ELEVATION_REQUIRED = "JIT_ELEVATION_REQUIRED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_REVOKED = "TOKEN_REVOKED"

    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"

    # Resource
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    GONE = "GONE"

    # Server
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE"

    # Classification
    CLASSIFICATION_VIOLATION = "CLASSIFICATION_VIOLATION"
    NEED_TO_KNOW_DENIED = "NEED_TO_KNOW_DENIED"


class APIError(BaseModel):
    """Standard IIP API error response envelope."""

    error_code: ErrorCode
    detail: str
    field: str | None = None
    meta: dict[str, Any] | None = None


class APIErrorResponse(BaseModel):
    """Top-level HTTP error response body."""

    error: APIError
    request_id: str | None = None


class IIPException(Exception):
    """Base exception for all IIP domain errors."""

    def __init__(
        self,
        status_code: int,
        error_code: ErrorCode,
        detail: str,
        meta: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.detail = detail
        self.meta = meta
        super().__init__(detail)


class NotFoundError(IIPException):
    def __init__(self, resource: str, resource_id: str) -> None:
        super().__init__(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail=f"{resource} with ID '{resource_id}' was not found.",
        )


class ForbiddenError(IIPException):
    def __init__(self, detail: str = "You do not have permission to perform this action.") -> None:
        super().__init__(
            status_code=403,
            error_code=ErrorCode.FORBIDDEN,
            detail=detail,
        )


class ClassificationViolationError(IIPException):
    def __init__(self, detail: str) -> None:
        super().__init__(
            status_code=403,
            error_code=ErrorCode.CLASSIFICATION_VIOLATION,
            detail=detail,
        )


class JITElevationRequiredError(IIPException):
    def __init__(self, resource: str) -> None:
        super().__init__(
            status_code=403,
            error_code=ErrorCode.JIT_ELEVATION_REQUIRED,
            detail=f"JIT session elevation is required to access '{resource}'.",
        )


# ─── FastAPI Exception Handler ─────────────────────────────────────────────────


def _json_safe(value: Any) -> Any:
    """Coerce numpy scalars and nested structures for JSONResponse."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, numbers.Real):
        return float(value)
    return value


async def iip_exception_handler(request: Request, exc: IIPException) -> JSONResponse:
    """Register with FastAPI app to return structured API error responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content=APIErrorResponse(
            error=APIError(
                error_code=exc.error_code,
                detail=exc.detail,
                meta=_json_safe(exc.meta) if exc.meta else None,
            ),
            request_id=request.headers.get("X-Request-ID"),
        ).model_dump(),
    )
