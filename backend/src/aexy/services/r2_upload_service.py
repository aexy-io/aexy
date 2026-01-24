"""Service for handling chunked uploads to Cloudflare R2 for assessment recordings."""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from aexy.core.config import settings

logger = logging.getLogger(__name__)


class R2UploadService:
    """Service for managing multipart uploads to Cloudflare R2."""

    def __init__(self):
        self.s3_client = None
        self.bucket = settings.r2_bucket_name
        self.prefix = settings.r2_recordings_prefix

        if settings.r2_access_key_id and settings.r2_secret_access_key and settings.r2_account_id:
            # R2 is S3-compatible, so we use boto3 with the R2 endpoint
            self.s3_client = boto3.client(
                "s3",
                endpoint_url=settings.r2_endpoint_url,
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
                region_name="auto",  # R2 uses 'auto' as region
            )
            logger.info(f"R2 client initialized with endpoint: {settings.r2_endpoint_url}")

    def is_configured(self) -> bool:
        """Check if R2 is properly configured."""
        return self.s3_client is not None and bool(self.bucket)

    def generate_recording_key(
        self,
        attempt_id: str,
        recording_type: str,
        extension: str = "webm",
    ) -> str:
        """Generate R2 key for a recording.

        Args:
            attempt_id: Assessment attempt ID.
            recording_type: Type of recording (webcam or screen).
            extension: File extension.

        Returns:
            R2 key path for the recording.
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        unique_id = str(uuid4())[:8]
        filename = f"{attempt_id}_{recording_type}_{timestamp}_{unique_id}.{extension}"
        return f"{self.prefix}/{recording_type}/{filename}"

    async def initiate_multipart_upload(
        self,
        attempt_id: str,
        recording_type: str,
        content_type: str = "video/webm",
    ) -> dict[str, Any] | None:
        """Initiate a multipart upload to R2.

        Args:
            attempt_id: Assessment attempt ID.
            recording_type: Type of recording (webcam or screen).
            content_type: MIME type of the recording.

        Returns:
            Dictionary with upload_id and key, or None if R2 not configured.
        """
        if not self.is_configured():
            logger.warning("R2 not configured, cannot initiate multipart upload")
            return None

        key = self.generate_recording_key(attempt_id, recording_type)

        try:
            response = self.s3_client.create_multipart_upload(
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
        """Generate a presigned URL for uploading a part.

        Args:
            key: R2 object key.
            upload_id: Multipart upload ID.
            part_number: Part number (1-indexed).
            expires_in: URL expiration time in seconds.

        Returns:
            Presigned URL or None if failed.
        """
        if not self.is_configured():
            return None

        try:
            url = self.s3_client.generate_presigned_url(
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
        """Complete a multipart upload.

        Args:
            key: R2 object key.
            upload_id: Multipart upload ID.
            parts: List of parts with ETag and PartNumber.

        Returns:
            R2 URL of the uploaded object or None if failed.
        """
        if not self.is_configured():
            return None

        try:
            # Sort parts by PartNumber
            sorted_parts = sorted(parts, key=lambda p: p["PartNumber"])

            self.s3_client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": sorted_parts},
            )

            # Return the R2 URL (use public URL if configured, otherwise use S3-style URL)
            # For R2, you can set up a custom domain or use the public bucket URL
            url = f"https://{self.bucket}.{settings.r2_account_id}.r2.cloudflarestorage.com/{key}"

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
        """Abort a multipart upload and clean up.

        Args:
            key: R2 object key.
            upload_id: Multipart upload ID.

        Returns:
            True if aborted successfully, False otherwise.
        """
        if not self.is_configured():
            return False

        try:
            self.s3_client.abort_multipart_upload(
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
        """Generate a presigned URL for downloading a recording.

        Args:
            key: R2 object key.
            expires_in: URL expiration time in seconds.

        Returns:
            Presigned URL or None if failed.
        """
        if not self.is_configured():
            return None

        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                },
                ExpiresIn=expires_in,
            )
            return url

        except ClientError as e:
            logger.error(f"Failed to generate presigned download URL: {e}")
            return None

    async def generate_presigned_direct_upload_url(
        self,
        attempt_id: str,
        recording_type: str,
        content_type: str = "video/webm",
        expires_in: int = 3600,
    ) -> dict[str, Any] | None:
        """Generate a presigned URL for direct (non-multipart) upload.

        Use this for small files (under 5MB) that don't need multipart upload.

        Args:
            attempt_id: Assessment attempt ID.
            recording_type: Type of recording (webcam or screen).
            content_type: MIME type of the recording.
            expires_in: URL expiration time in seconds.

        Returns:
            Dictionary with presigned_url and key, or None if failed.
        """
        if not self.is_configured():
            return None

        key = self.generate_recording_key(attempt_id, recording_type)

        try:
            url = self.s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )

            logger.info(f"Generated direct upload URL for {recording_type}: {key}")

            return {
                "presigned_url": url,
                "key": key,
                "bucket": self.bucket,
            }

        except ClientError as e:
            logger.error(f"Failed to generate direct upload URL: {e}")
            return None

    def get_object_url(self, key: str) -> str:
        """Get the public URL for an uploaded object.

        Args:
            key: R2 object key.

        Returns:
            URL for the object.
        """
        return f"https://{self.bucket}.{settings.r2_account_id}.r2.cloudflarestorage.com/{key}"


# Singleton instance
_r2_service = None


def get_r2_upload_service() -> R2UploadService:
    """Get or create the R2 upload service singleton."""
    global _r2_service
    if _r2_service is None:
        _r2_service = R2UploadService()
    return _r2_service
