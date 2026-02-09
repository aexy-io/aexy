"""Generic S3-compatible storage service.

Replaces the R2-specific upload service with a generic implementation
that works with any S3-compatible backend (RustFS, MinIO, R2, AWS S3).
"""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from aexy.core.config import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Service for managing file uploads/downloads via S3-compatible storage."""

    def __init__(self):
        self._client = None
        self._public_client = None
        self.bucket = settings.s3_bucket_name
        self.recordings_prefix = settings.s3_recordings_prefix
        self.compliance_prefix = settings.s3_compliance_prefix

        endpoint_url = settings.s3_endpoint_url
        access_key = settings.s3_access_key_id
        secret_key = settings.s3_secret_access_key
        region = settings.s3_region

        # Fall back to R2 config if S3 config not set
        if not endpoint_url and settings.r2_account_id:
            endpoint_url = settings.r2_endpoint_url
            access_key = settings.r2_access_key_id
            secret_key = settings.r2_secret_access_key
            self.bucket = settings.r2_bucket_name or self.bucket
            region = "auto"

        if endpoint_url and access_key and secret_key:
            s3_config = Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            )
            self._client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=s3_config,
                region_name=region,
            )
            logger.info(f"Storage client initialized with endpoint: {endpoint_url}")

            # Create a separate client for presigned URLs using public endpoint
            public_endpoint = settings.s3_public_endpoint_url or endpoint_url
            if public_endpoint != endpoint_url:
                self._public_client = boto3.client(
                    "s3",
                    endpoint_url=public_endpoint,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    config=s3_config,
                    region_name=region,
                )
            else:
                self._public_client = self._client

    def is_configured(self) -> bool:
        """Check if storage is properly configured."""
        return self._client is not None and bool(self.bucket)

    async def ensure_bucket_exists(self) -> bool:
        """Create the storage bucket if it doesn't exist."""
        if not self._client:
            logger.warning("Storage not configured, cannot ensure bucket exists")
            return False

        try:
            self._client.head_bucket(Bucket=self.bucket)
            logger.info(f"Storage bucket '{self.bucket}' already exists")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchBucket"):
                try:
                    self._client.create_bucket(Bucket=self.bucket)
                    logger.info(f"Created storage bucket '{self.bucket}'")
                    return True
                except ClientError as create_err:
                    logger.error(f"Failed to create bucket '{self.bucket}': {create_err}")
                    return False
            else:
                logger.error(f"Failed to check bucket '{self.bucket}': {e}")
                return False

    # --- Generic presigned URL methods ---

    def generate_presigned_put_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 3600,
    ) -> str | None:
        """Generate a presigned URL for uploading a file (PUT).

        Uses the public endpoint so the URL is accessible from the browser.
        """
        if not self.is_configured():
            return None

        try:
            client = self._public_client or self._client
            url = client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned PUT URL: {e}")
            return None

    def generate_presigned_get_url(
        self,
        key: str,
        expires_in: int = 3600,
    ) -> str | None:
        """Generate a presigned URL for downloading a file (GET).

        Uses the public endpoint so the URL is accessible from the browser.
        """
        if not self.is_configured():
            return None

        try:
            client = self._public_client or self._client
            url = client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                },
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned GET URL: {e}")
            return None

    def put_object(
        self,
        key: str,
        data: bytes,
        content_type: str,
    ) -> bool:
        """Upload an object directly to storage."""
        if not self.is_configured():
            return False

        try:
            self._client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            logger.info(f"Uploaded object: {key} ({len(data)} bytes)")
            return True
        except ClientError as e:
            logger.error(f"Failed to upload object {key}: {e}")
            return False

    async def delete_object(self, key: str) -> bool:
        """Delete an object from storage."""
        if not self.is_configured():
            return False

        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
            logger.info(f"Deleted object: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete object {key}: {e}")
            return False

    # --- Assessment recording methods (backward compatible) ---

    def generate_recording_key(
        self,
        attempt_id: str,
        recording_type: str,
        extension: str = "webm",
    ) -> str:
        """Generate S3 key for a recording."""
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        unique_id = str(uuid4())[:8]
        filename = f"{attempt_id}_{recording_type}_{timestamp}_{unique_id}.{extension}"
        return f"{self.recordings_prefix}/{recording_type}/{filename}"

    async def initiate_multipart_upload(
        self,
        attempt_id: str,
        recording_type: str,
        content_type: str = "video/webm",
    ) -> dict[str, Any] | None:
        """Initiate a multipart upload."""
        if not self.is_configured():
            logger.warning("Storage not configured, cannot initiate multipart upload")
            return None

        key = self.generate_recording_key(attempt_id, recording_type)

        try:
            response = self._client.create_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                ContentType=content_type,
                Metadata={
                    "attempt_id": attempt_id,
                    "recording_type": recording_type,
                },
            )
            logger.info(f"Initiated multipart upload for {recording_type}: {key}")
            return {
                "upload_id": response["UploadId"],
                "key": key,
                "bucket": self.bucket,
            }
        except ClientError as e:
            logger.error(f"Failed to initiate multipart upload: {e}")
            return None

    async def generate_presigned_upload_url(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in: int = 3600,
    ) -> str | None:
        """Generate a presigned URL for uploading a multipart part."""
        if not self.is_configured():
            return None

        try:
            client = self._public_client or self._client
            url = client.generate_presigned_url(
                "upload_part",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "UploadId": upload_id,
                    "PartNumber": part_number,
                },
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None

    async def complete_multipart_upload(
        self,
        key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> str | None:
        """Complete a multipart upload."""
        if not self.is_configured():
            return None

        try:
            sorted_parts = sorted(parts, key=lambda p: p["PartNumber"])
            self._client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": sorted_parts},
            )
            url = self.get_object_url(key)
            logger.info(f"Completed multipart upload: {url}")
            return url
        except ClientError as e:
            logger.error(f"Failed to complete multipart upload: {e}")
            return None

    async def abort_multipart_upload(
        self,
        key: str,
        upload_id: str,
    ) -> bool:
        """Abort a multipart upload and clean up."""
        if not self.is_configured():
            return False

        try:
            self._client.abort_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
            )
            logger.info(f"Aborted multipart upload: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to abort multipart upload: {e}")
            return False

    async def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 3600,
    ) -> str | None:
        """Generate a presigned URL for downloading."""
        return self.generate_presigned_get_url(key, expires_in)

    async def generate_presigned_direct_upload_url(
        self,
        attempt_id: str,
        recording_type: str,
        content_type: str = "video/webm",
        expires_in: int = 3600,
    ) -> dict[str, Any] | None:
        """Generate a presigned URL for direct (non-multipart) upload."""
        if not self.is_configured():
            return None

        key = self.generate_recording_key(attempt_id, recording_type)

        url = self.generate_presigned_put_url(key, content_type, expires_in)
        if not url:
            return None

        logger.info(f"Generated direct upload URL for {recording_type}: {key}")
        return {
            "presigned_url": url,
            "key": key,
            "bucket": self.bucket,
        }

    def get_object_url(self, key: str) -> str:
        """Get a URL for an uploaded object."""
        public_endpoint = settings.s3_public_endpoint_url or settings.s3_endpoint_url
        if public_endpoint:
            return f"{public_endpoint.rstrip('/')}/{self.bucket}/{key}"
        # Fall back to R2-style URL
        if settings.r2_account_id:
            return f"https://{self.bucket}.{settings.r2_account_id}.r2.cloudflarestorage.com/{key}"
        return f"s3://{self.bucket}/{key}"


# Singleton instance
_storage_service = None


def get_storage_service() -> StorageService:
    """Get or create the storage service singleton."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
