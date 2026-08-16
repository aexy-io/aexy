"""Apps we gate cannot be switched on from inside a workspace.

Learning is in the catalog, off in every bundle, and marked `contact_support`.
The gate matters at every path that can grant access, not just the obvious one:
the access matrix, the per-app override editor, the template editor and the
request-approve button all write the same `{app: {enabled}}` shape, so a check
on one of them is not a check at all.
"""

import pytest

from aexy.models.app_definitions import (
    APP_CATALOG,
    SYSTEM_APP_BUNDLES,
    AppAvailability,
    get_app_list,
)
from aexy.services.app_access_service import (
    AppNotSelfServeError,
    assert_self_serve_enablement,
    is_self_serve,
)


def test_learning_is_gated_and_off_everywhere():
    assert APP_CATALOG["learning"]["availability"] == AppAvailability.CONTACT_SUPPORT
    assert not is_self_serve("learning")

    for bundle_id, bundle in SYSTEM_APP_BUNDLES.items():
        learning = bundle["apps"].get("learning")
        assert learning is None or learning.get("enabled") is False, (
            f"the {bundle_id} bundle would switch Learning on"
        )


def test_everything_else_is_still_self_serve():
    """A gate that quietly caught other apps would be a much bigger change."""
    gated = [app_id for app_id in APP_CATALOG if not is_self_serve(app_id)]
    assert gated == ["learning"]


def test_enabling_a_gated_app_is_refused_and_says_which():
    with pytest.raises(AppNotSelfServeError) as caught:
        assert_self_serve_enablement(
            {"crm": {"enabled": True}, "learning": {"enabled": True}}
        )
    # The caller is told which app of the batch was refused, not just that
    # something was.
    assert caught.value.app_ids == ["learning"]
    assert "support@aexy.io" in str(caught.value)


def test_turning_a_gated_app_off_is_always_allowed():
    """Nothing here should stop somebody removing access."""
    assert_self_serve_enablement({"learning": {"enabled": False}})
    assert_self_serve_enablement({"learning": {}})
    assert_self_serve_enablement(None)


def test_the_catalog_tells_the_ui_which_apps_it_may_offer():
    """The admin UI renders the toggle it is allowed to offer, so it has to know."""
    apps = {app["id"]: app for app in get_app_list()}
    assert apps["learning"]["availability"] == "contact_support"
    assert apps["learning"]["support_contact"] == "support@aexy.io"
    assert apps["crm"]["availability"] == "self_serve"
    assert apps["crm"]["support_contact"] is None
