"""Celery app configuration - DEPRECATED.

All background task processing has been migrated to Temporal.
See: aexy.temporal.dispatch, aexy.temporal.schedules, aexy.temporal.activities

This module is retained only for backward compatibility with any remaining
imports. The celery_app object is set to None.
"""

import warnings

warnings.warn(
    "aexy.processing.celery_app is deprecated. Use aexy.temporal.dispatch instead.",
    DeprecationWarning,
    stacklevel=2,
)

# Stub so old `from aexy.processing.celery_app import celery_app` doesn't crash at import time.
celery_app = None
