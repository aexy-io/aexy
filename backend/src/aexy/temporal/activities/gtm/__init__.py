"""GTM (Go-To-Market) Temporal activities package.

Re-exports all activities and input dataclasses from sub-modules so that
existing imports like ``from aexy.temporal.activities.gtm import ...`` continue
to work without any changes.
"""

from aexy.temporal.activities.gtm.lead_scoring import (
    IdentifyVisitorSessionInput,
    ProcessVisitorEventsInput,
    VerifyEmailInput,
    ScoreLeadInput,
    BatchScoreLeadsInput,
    identify_visitor_session,
    process_visitor_events,
    verify_email_address,
    score_lead,
    batch_score_leads,
)
from aexy.temporal.activities.gtm.dedup import (
    BulkDedupInput,
    bulk_find_duplicates,
)
from aexy.temporal.activities.gtm.outreach import (
    OutreachEnrollmentInput,
    ExecuteStepInput,
    FinalizeEnrollmentInput,
    execute_outreach_step,
    finalize_enrollment,
)
from aexy.temporal.activities.gtm.reporting import (
    GenerateWeeklyReportInput,
    ClassifyReplyInput,
    PersonalizeOutreachBatchInput,
    BulkImportInput,
    generate_weekly_gtm_report,
    classify_outreach_reply,
    personalize_outreach_batch,
    run_bulk_import,
)
from aexy.temporal.activities.gtm.alerts_routing import (
    SendGTMAlertInput,
    RouteNewLeadInput,
    CheckSLABreachesInput,
    send_gtm_alert,
    route_new_lead,
    check_sla_breaches,
)
from aexy.temporal.activities.gtm.customer_success import (
    ScoreCustomerHealthInput,
    BatchScoreCustomerHealthInput,
    DetectHealthDropsInput,
    EvaluateExpansionTriggersInput,
    AdvanceExpansionStepInput,
    score_customer_health,
    batch_score_customer_health,
    detect_health_drops,
    evaluate_expansion_triggers,
    advance_expansion_step,
)
from aexy.temporal.activities.gtm.intelligence import (
    CollectIntentSignalsInput,
    MatchIntentSignalsInput,
    CheckCompetitorChangesInput,
    GenerateBattleCardInput,
    RunSEOAuditInput,
    RunContentGapAnalysisInput,
    collect_intent_signals,
    match_intent_signals_to_records,
    check_competitor_changes,
    generate_battle_card,
    run_seo_audit,
    run_content_gap_analysis,
)
from aexy.temporal.activities.gtm.abm import (
    RecalculateABMEngagementInput,
    RefreshDynamicABMListsInput,
    recalculate_abm_engagement,
    refresh_dynamic_abm_lists,
)
from aexy.temporal.activities.gtm.maintenance import (
    CleanupIPAddressesInput,
    PurgeBehavioralEventsInput,
    cleanup_ip_addresses,
    purge_behavioral_events,
)

__all__ = [
    # lead_scoring
    "IdentifyVisitorSessionInput",
    "ProcessVisitorEventsInput",
    "VerifyEmailInput",
    "ScoreLeadInput",
    "BatchScoreLeadsInput",
    "identify_visitor_session",
    "process_visitor_events",
    "verify_email_address",
    "score_lead",
    "batch_score_leads",
    # dedup
    "BulkDedupInput",
    "bulk_find_duplicates",
    # outreach
    "OutreachEnrollmentInput",
    "ExecuteStepInput",
    "FinalizeEnrollmentInput",
    "execute_outreach_step",
    "finalize_enrollment",
    # reporting
    "GenerateWeeklyReportInput",
    "ClassifyReplyInput",
    "PersonalizeOutreachBatchInput",
    "BulkImportInput",
    "generate_weekly_gtm_report",
    "classify_outreach_reply",
    "personalize_outreach_batch",
    "run_bulk_import",
    # alerts_routing
    "SendGTMAlertInput",
    "RouteNewLeadInput",
    "CheckSLABreachesInput",
    "send_gtm_alert",
    "route_new_lead",
    "check_sla_breaches",
    # customer_success
    "ScoreCustomerHealthInput",
    "BatchScoreCustomerHealthInput",
    "DetectHealthDropsInput",
    "EvaluateExpansionTriggersInput",
    "AdvanceExpansionStepInput",
    "score_customer_health",
    "batch_score_customer_health",
    "detect_health_drops",
    "evaluate_expansion_triggers",
    "advance_expansion_step",
    # intelligence
    "CollectIntentSignalsInput",
    "MatchIntentSignalsInput",
    "CheckCompetitorChangesInput",
    "GenerateBattleCardInput",
    "RunSEOAuditInput",
    "RunContentGapAnalysisInput",
    "collect_intent_signals",
    "match_intent_signals_to_records",
    "check_competitor_changes",
    "generate_battle_card",
    "run_seo_audit",
    "run_content_gap_analysis",
    # abm
    "RecalculateABMEngagementInput",
    "RefreshDynamicABMListsInput",
    "recalculate_abm_engagement",
    "refresh_dynamic_abm_lists",
    # maintenance
    "CleanupIPAddressesInput",
    "PurgeBehavioralEventsInput",
    "cleanup_ip_addresses",
    "purge_behavioral_events",
]
