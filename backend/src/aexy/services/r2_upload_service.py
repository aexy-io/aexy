"""Backward compatibility shim for R2 upload service.

This module re-exports from storage_service.py so existing code
that imports R2UploadService or get_r2_upload_service continues to work.
"""

from aexy.services.storage_service import StorageService as R2UploadService
from aexy.services.storage_service import get_storage_service as get_r2_upload_service

__all__ = ["R2UploadService", "get_r2_upload_service"]
