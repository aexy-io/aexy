"""A permission preview must not consume an actual send allowance."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.services.gtm_compliance_service import GTMComplianceService


@pytest.mark.asyncio
async def test_preflight_permission_does_not_write_a_send_audit_entry():
    service = GTMComplianceService(MagicMock())
    service.check_suppression = AsyncMock(return_value=False)
    service.get_consent_status = AsyncMock(return_value={"has_consent": True, "is_active": True, "consent_type": "explicit_opt_in"})
    service._get_active_consent_record = AsyncMock(return_value=None)
    service._log_audit = AsyncMock()
    result = MagicMock()
    result.scalar.return_value = 0
    service.db.execute = AsyncMock(return_value=result)

    permission = await service.check_send_permission(
        "workspace-1", "test@example.com", record_decision=False,
    )

    assert permission["allowed"] is True
    service._log_audit.assert_not_awaited()
