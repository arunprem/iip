"""S3-compatible object storage (MinIO) for uploads across IIP services."""

from __future__ import annotations

import asyncio
import re
import uuid
from functools import lru_cache
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from iip_core.logging import get_logger

if TYPE_CHECKING:
    from iip_core.settings import BaseServiceSettings

logger = get_logger(__name__)

PROFILE_PHOTOS_PREFIX = "profile-photos"
DOCUMENTS_PREFIX = "documents"


def profile_photo_object_key(user_id: str | uuid.UUID, extension: str) -> str:
    """profile-photos/{user_id}/current.jpg"""
    return f"{PROFILE_PHOTOS_PREFIX}/{user_id}/current{extension}"


def profile_photo_prefix(user_id: str | uuid.UUID) -> str:
    return f"{PROFILE_PHOTOS_PREFIX}/{user_id}/"


def document_object_key(domain: str, entity_id: str, file_id: str, filename: str) -> str:
    """documents/{domain}/{entity_id}/{file_id}-{filename}"""
    safe = re.sub(r"[^\w.\-]+", "_", filename).strip("._") or "file"
    return f"{DOCUMENTS_PREFIX}/{domain}/{entity_id}/{file_id}-{safe}"


def is_object_storage_key(stored_path: str | None) -> bool:
    if not stored_path:
        return False
    return stored_path.startswith(f"{PROFILE_PHOTOS_PREFIX}/") or stored_path.startswith(
        f"{DOCUMENTS_PREFIX}/"
    )


class ObjectStorageService:
    """Thin async wrapper around boto3 S3 API (MinIO-compatible)."""

    def __init__(self, settings: BaseServiceSettings) -> None:
        self._settings = settings
        self._client = None

    @property
    def enabled(self) -> bool:
        return bool(self._settings.s3_endpoint_url and self._settings.s3_bucket)

    @property
    def bucket(self) -> str:
        return self._settings.s3_bucket

    def _client_sync(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings.s3_endpoint_url,
                aws_access_key_id=self._settings.s3_access_key,
                aws_secret_access_key=self._settings.s3_secret_key,
                region_name=self._settings.s3_region,
                config=Config(signature_version="s3v4"),
                use_ssl=self._settings.s3_use_ssl,
            )
        return self._client

    def _ensure_bucket_sync(self) -> None:
        if not self.enabled:
            return
        client = self._client_sync()
        bucket = self.bucket
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code not in ("404", "NoSuchBucket", "403"):
                raise
            client.create_bucket(Bucket=bucket)
            logger.info("s3_bucket_created", bucket=bucket)

    async def ensure_ready(self) -> None:
        if not self.enabled:
            logger.warning("object_storage_not_configured")
            return
        await asyncio.to_thread(self._ensure_bucket_sync)

    def _put_sync(self, key: str, data: bytes, content_type: str) -> None:
        self._client_sync().put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def _get_sync(self, key: str) -> tuple[bytes, str] | None:
        try:
            response = self._client_sync().get_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404"):
                return None
            raise
        body = response["Body"].read()
        content_type = response.get("ContentType") or "application/octet-stream"
        return body, content_type

    def _delete_sync(self, key: str) -> None:
        try:
            self._client_sync().delete_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404"):
                return
            raise

    def _delete_prefix_sync(self, prefix: str, *, keep_key: str | None = None) -> None:
        client = self._client_sync()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents") or []:
                key = item["Key"]
                if keep_key and key == keep_key:
                    continue
                client.delete_object(Bucket=self.bucket, Key=key)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        if not self.enabled:
            raise RuntimeError("Object storage is not configured.")
        await asyncio.to_thread(self._put_sync, key, data, content_type)
        logger.info("object_storage_put", bucket=self.bucket, key=key, bytes=len(data))

    async def get(self, key: str) -> tuple[bytes, str] | None:
        if not self.enabled:
            return None
        return await asyncio.to_thread(self._get_sync, key)

    async def delete(self, key: str) -> None:
        if not self.enabled:
            return
        await asyncio.to_thread(self._delete_sync, key)

    async def delete_prefix(self, prefix: str, *, keep_key: str | None = None) -> None:
        if not self.enabled:
            return
        await asyncio.to_thread(self._delete_prefix_sync, prefix, keep_key=keep_key)


@lru_cache(maxsize=1)
def get_object_storage() -> ObjectStorageService:
    from iip_core.settings import get_settings

    return ObjectStorageService(get_settings())
