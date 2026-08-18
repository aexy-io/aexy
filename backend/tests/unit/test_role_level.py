"""One definition of how much authority a member has.

There were two, and they disagreed. `WorkspaceService.check_permission` scored
`member.role` — the legacy column, which stays `"member"` when a custom role is
assigned, because `role` and `role_id` coexist. `AppAccessService._is_admin`
scored the custom role. So a member holding a custom admin-equivalent role was
granted every app by the access layer, shown the controls that go with them, and
refused by the endpoint behind each one — `is_admin: true` from
`/app-access/members/{id}/effective` and 403 from the `PATCH` beside it,
reproduced against a running API.

The data model already says which answer is right: `role_id` is documented as
taking precedence over the legacy role.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from aexy.services.app_access_service import AppAccessService
from aexy.services.workspace_service import ROLE_HIERARCHY, role_level


def member(role="member", *, template=None, priority=50, active=True, has_custom=None):
    custom = None
    if has_custom or template is not None or priority != 50:
        custom = SimpleNamespace(
            based_on_template=template, priority=priority, is_active=active
        )
    return SimpleNamespace(role=role, custom_role=custom)


class TestResolvingAuthority:
    def test_a_legacy_role_still_decides_when_there_is_no_custom_one(self):
        assert role_level(member("owner")) == ROLE_HIERARCHY["owner"]
        assert role_level(member("admin")) == ROLE_HIERARCHY["admin"]
        assert role_level(member("member")) == ROLE_HIERARCHY["member"]
        assert role_level(member("viewer")) == ROLE_HIERARCHY["viewer"]

    def test_community_stays_below_every_internal_gate(self):
        # Outside participants who joined through a public forum. They only ever
        # use the public endpoints.
        assert role_level(member("community")) < ROLE_HIERARCHY["viewer"]

    def test_a_custom_admin_role_confers_admin(self):
        """The bug, in one assertion: this member's legacy column says "member",
        and every admin endpoint refused them while the app-access layer granted
        them everything."""
        assert role_level(member("member", template="admin")) == ROLE_HIERARCHY["admin"]

    def test_a_custom_role_with_admin_priority_confers_admin(self):
        # No template to read, so priority is the only signal — and 100 is what
        # the seeded admin template uses.
        assert (
            role_level(member("member", template=None, priority=100))
            == ROLE_HIERARCHY["admin"]
        )

    def test_a_junior_custom_role_does_not_reduce_a_legacy_owner(self):
        """Additive, not authoritative. Otherwise assigning somebody a job title
        would be a way to demote the workspace owner."""
        assert (
            role_level(member("owner", template="viewer", priority=10))
            == ROLE_HIERARCHY["owner"]
        )

    def test_a_soft_deleted_custom_role_confers_nothing(self):
        assert (
            role_level(member("member", template="admin", active=False))
            == ROLE_HIERARCHY["member"]
        )

    def test_a_custom_role_with_no_rank_leaves_the_legacy_role_alone(self):
        # "developer", "hr", "support", "sales" are real templates and none of
        # them is a rank. Reading one as zero used to be the danger; it must
        # simply not lower anybody.
        assert (
            role_level(member("member", template="developer", priority=60))
            == ROLE_HIERARCHY["member"]
        )

    def test_a_contradictory_custom_role_keeps_the_higher_reading(self):
        """Based on the viewer template, carrying admin priority. `_is_admin` read
        the two independently and called this admin, so resolving it down to
        viewer would take app access away from somebody who has it today."""
        assert (
            role_level(member("member", template="viewer", priority=100))
            == ROLE_HIERARCHY["admin"]
        )

    def test_an_unrecognised_legacy_role_scores_nothing_on_its_own(self):
        assert role_level(member("wizard")) == 0


class TestTheTwoAnswersConverge:
    @pytest.mark.asyncio
    async def test_is_admin_agrees_with_the_permission_check(self):
        """The property that was false. Asserted over every shape rather than the
        one that bit us, because agreeing in one case is what the old code did."""
        service = AppAccessService.__new__(AppAccessService)

        cases = [
            member("owner"),
            member("admin"),
            member("member"),
            member("viewer"),
            member("community"),
            member("member", template="admin"),
            member("member", template=None, priority=100),
            member("member", template="developer", priority=60),
            member("member", template="admin", active=False),
            member("owner", template="viewer", priority=10),
            member("member", template="viewer", priority=100),
        ]

        for candidate in cases:
            # `check_permission` is `role_level(...) >= admin` once the member is
            # loaded; comparing against that is comparing against the gate.
            expected = role_level(candidate) >= ROLE_HIERARCHY["admin"]
            assert await service._is_admin(candidate) is expected, candidate

    @pytest.mark.asyncio
    async def test_the_case_reproduced_against_the_running_api(self):
        service = AppAccessService.__new__(AppAccessService)
        custom_admin = member("member", template="admin", priority=100)

        assert await service._is_admin(custom_admin) is True
        assert role_level(custom_admin) >= ROLE_HIERARCHY["admin"]
