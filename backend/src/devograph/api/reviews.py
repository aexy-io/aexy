"""Review and Goal API endpoints."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.llm.gateway import get_llm_gateway
from devograph.schemas.review import (
    # Review Cycle
    ReviewCycleCreate,
    ReviewCycleUpdate,
    ReviewCycleResponse,
    ReviewCycleDetailResponse,
    # Individual Review
    IndividualReviewResponse,
    IndividualReviewDetailResponse,
    # Submissions
    SelfReviewSubmission,
    SelfReviewUpdate,
    PeerReviewSubmission,
    ManagerReviewSubmission,
    ReviewSubmissionResponse,
    FinalReviewData,
    # Peer Requests
    PeerReviewRequest,
    PeerReviewerAssignment,
    PeerRequestResponse,
    ReviewRequestResponse,
    # Goals
    WorkGoalCreate,
    WorkGoalUpdate,
    WorkGoalResponse,
    WorkGoalDetailResponse,
    GoalProgressUpdate,
    GoalCompletionData,
    LinkActivityRequest,
    LinkedContributionsResponse,
    GoalSuggestion,
    # Contributions
    ContributionSummaryResponse,
    ContributionSummaryRequest,
    ContributionHighlight,
)
from devograph.services.review_service import ReviewService
from devograph.services.goal_service import GoalService
from devograph.services.contribution_service import ContributionService

router = APIRouter(prefix="/reviews")


# ============ Review Cycle Endpoints ============

@router.post("/workspaces/{workspace_id}/cycles", response_model=ReviewCycleResponse)
async def create_review_cycle(
    workspace_id: str,
    data: ReviewCycleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new review cycle for a workspace."""
    service = ReviewService(db)
    cycle = await service.create_review_cycle(
        workspace_id=workspace_id,
        name=data.name,
        period_start=data.period_start,
        period_end=data.period_end,
        cycle_type=data.cycle_type.value,
        self_review_deadline=data.self_review_deadline,
        peer_review_deadline=data.peer_review_deadline,
        manager_review_deadline=data.manager_review_deadline,
        settings=data.settings.model_dump() if data.settings else None,
    )
    return ReviewCycleResponse.model_validate(cycle)


@router.get("/workspaces/{workspace_id}/cycles", response_model=list[ReviewCycleResponse])
async def list_review_cycles(
    workspace_id: str,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List review cycles for a workspace."""
    service = ReviewService(db)
    cycles = await service.list_review_cycles(workspace_id, status)
    return [ReviewCycleResponse.model_validate(c) for c in cycles]


@router.get("/cycles/{cycle_id}", response_model=ReviewCycleDetailResponse)
async def get_review_cycle(
    cycle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a review cycle with progress statistics."""
    service = ReviewService(db)
    cycle = await service.get_review_cycle(cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Review cycle not found")

    progress = await service.get_cycle_progress(cycle_id)

    return ReviewCycleDetailResponse(
        **ReviewCycleResponse.model_validate(cycle).model_dump(),
        total_reviews=progress.total_reviews,
        completed_reviews=progress.completed,
        pending_self_reviews=progress.pending_self_review,
        pending_peer_reviews=progress.pending_peer_review,
        pending_manager_reviews=progress.pending_manager_review,
    )


@router.put("/cycles/{cycle_id}", response_model=ReviewCycleResponse)
async def update_review_cycle(
    cycle_id: str,
    data: ReviewCycleUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a review cycle."""
    service = ReviewService(db)
    updates = data.model_dump(exclude_unset=True)

    # Convert enums to strings
    if "cycle_type" in updates and updates["cycle_type"]:
        updates["cycle_type"] = updates["cycle_type"].value
    if "status" in updates and updates["status"]:
        updates["status"] = updates["status"].value

    cycle = await service.update_review_cycle(cycle_id, **updates)
    if not cycle:
        raise HTTPException(status_code=404, detail="Review cycle not found")

    return ReviewCycleResponse.model_validate(cycle)


@router.post("/cycles/{cycle_id}/activate", response_model=ReviewCycleResponse)
async def activate_review_cycle(
    cycle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Activate a review cycle and create individual reviews."""
    service = ReviewService(db)
    cycle = await service.activate_review_cycle(cycle_id)
    if not cycle:
        raise HTTPException(
            status_code=400,
            detail="Cannot activate cycle (may already be active or not found)"
        )
    return ReviewCycleResponse.model_validate(cycle)


@router.post("/cycles/{cycle_id}/advance-phase")
async def advance_review_phase(
    cycle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Advance the review cycle to the next phase."""
    service = ReviewService(db)
    new_status = await service.advance_cycle_phase(cycle_id)
    if not new_status:
        raise HTTPException(status_code=404, detail="Review cycle not found")
    return {"status": new_status}


# ============ Individual Review Endpoints ============

@router.get("/my-reviews", response_model=list[IndividualReviewResponse])
async def get_my_reviews(
    developer_id: str,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get reviews where the developer is the reviewee."""
    service = ReviewService(db)
    reviews = await service.get_developer_reviews(developer_id, status)
    return [IndividualReviewResponse.model_validate(r) for r in reviews]


@router.get("/manager-reviews", response_model=list[IndividualReviewResponse])
async def get_manager_reviews(
    manager_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get reviews where the developer is the manager."""
    service = ReviewService(db)
    reviews = await service.get_manager_reviews(manager_id)
    return [IndividualReviewResponse.model_validate(r) for r in reviews]


@router.get("/{review_id}", response_model=IndividualReviewDetailResponse)
async def get_individual_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed individual review with submissions."""
    service = ReviewService(db)
    review = await service.get_individual_review(review_id, include_submissions=True)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Separate submissions by type
    self_review = None
    peer_reviews = []
    manager_review = None

    for submission in review.submissions:
        sub_response = ReviewSubmissionResponse.model_validate(submission)
        if submission.submission_type == "self":
            self_review = sub_response
        elif submission.submission_type == "peer":
            peer_reviews.append(sub_response)
        elif submission.submission_type == "manager":
            manager_review = sub_response

    # Get goals for this review cycle
    goal_service = GoalService(db)
    goals = await goal_service.list_goals(
        developer_id=review.developer_id,
        review_cycle_id=review.review_cycle_id,
    )

    return IndividualReviewDetailResponse(
        **IndividualReviewResponse.model_validate(review).model_dump(),
        contribution_summary=review.contribution_summary,
        ai_summary=review.ai_summary,
        self_review=self_review,
        peer_reviews=peer_reviews,
        manager_review=manager_review,
        goals=[WorkGoalResponse.model_validate(g) for g in goals],
    )


@router.get("/{review_id}/contributions", response_model=dict)
async def get_review_contributions(
    review_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get contribution summary for a review."""
    service = ReviewService(db)
    llm = get_llm_gateway()
    contribution_service = ContributionService(db, llm)
    service.contribution_service = contribution_service

    summary = await service.generate_contribution_summary(review_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Review not found or no contributions")

    return summary


@router.post("/{review_id}/self-review", response_model=ReviewSubmissionResponse)
async def submit_self_review(
    review_id: str,
    data: SelfReviewSubmission,
    db: AsyncSession = Depends(get_db),
):
    """Submit a self-review."""
    service = ReviewService(db)
    try:
        submission = await service.submit_self_review(
            review_id=review_id,
            responses=data.responses.model_dump(),
            linked_goals=data.linked_goals,
            linked_contributions=data.linked_contributions,
        )
        return ReviewSubmissionResponse.model_validate(submission)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{review_id}/manager-review", response_model=ReviewSubmissionResponse)
async def submit_manager_review(
    review_id: str,
    data: ManagerReviewSubmission,
    db: AsyncSession = Depends(get_db),
):
    """Submit a manager review."""
    service = ReviewService(db)
    try:
        submission = await service.submit_manager_review(
            review_id=review_id,
            responses=data.responses.model_dump(),
            overall_rating=data.overall_rating,
            ratings_breakdown=data.ratings_breakdown,
            linked_goals=data.linked_goals,
            linked_contributions=data.linked_contributions,
        )
        return ReviewSubmissionResponse.model_validate(submission)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{review_id}/finalize", response_model=IndividualReviewResponse)
async def finalize_review(
    review_id: str,
    data: FinalReviewData,
    db: AsyncSession = Depends(get_db),
):
    """Finalize a review (manager action)."""
    service = ReviewService(db, get_llm_gateway())
    review = await service.finalize_review(
        review_id=review_id,
        overall_rating=data.overall_rating,
        ratings_breakdown=data.ratings_breakdown,
        generate_ai_summary=True,
    )
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return IndividualReviewResponse.model_validate(review)


@router.post("/{review_id}/acknowledge", response_model=IndividualReviewResponse)
async def acknowledge_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Employee acknowledges their completed review."""
    service = ReviewService(db)
    review = await service.acknowledge_review(review_id)
    if not review:
        raise HTTPException(status_code=400, detail="Review not found or not completed")
    return IndividualReviewResponse.model_validate(review)


# ============ Peer Review Endpoints ============

@router.post("/{review_id}/peer-requests", response_model=ReviewRequestResponse)
async def request_peer_review(
    review_id: str,
    data: PeerReviewRequest,
    requester_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Request peer feedback from a team member."""
    service = ReviewService(db)
    request = await service.request_peer_review(
        review_id=review_id,
        requester_id=requester_id,
        reviewer_id=data.reviewer_id,
        message=data.message,
    )
    return ReviewRequestResponse.model_validate(request)


@router.post("/{review_id}/assign-peer-reviewers", response_model=list[ReviewRequestResponse])
async def assign_peer_reviewers(
    review_id: str,
    data: PeerReviewerAssignment,
    manager_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Manager assigns peer reviewers."""
    service = ReviewService(db)
    try:
        requests = await service.assign_peer_reviewers(
            review_id=review_id,
            manager_id=manager_id,
            reviewer_ids=data.reviewer_ids,
            message=data.message,
        )
        return [ReviewRequestResponse.model_validate(r) for r in requests]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/peer-requests/pending", response_model=list[ReviewRequestResponse])
async def get_pending_peer_requests(
    reviewer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get pending peer review requests for a reviewer."""
    service = ReviewService(db)
    requests = await service.get_pending_peer_requests(reviewer_id)
    return [ReviewRequestResponse.model_validate(r) for r in requests]


@router.post("/peer-requests/{request_id}/respond", response_model=ReviewRequestResponse)
async def respond_to_peer_request(
    request_id: str,
    data: PeerRequestResponse,
    db: AsyncSession = Depends(get_db),
):
    """Respond to a peer review request (accept/decline)."""
    service = ReviewService(db)
    request = await service.respond_to_peer_request(
        request_id=request_id,
        accept=data.accept,
        decline_reason=data.decline_reason,
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found or already responded")
    return ReviewRequestResponse.model_validate(request)


@router.post("/peer-requests/{request_id}/submit", response_model=ReviewSubmissionResponse)
async def submit_peer_review(
    request_id: str,
    data: PeerReviewSubmission,
    reviewer_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Submit a peer review for an accepted request."""
    # Get the request to find the review
    service = ReviewService(db)
    request = await service.db.get(
        __import__("devograph.models.review", fromlist=["ReviewRequest"]).ReviewRequest,
        request_id
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    submission = await service.submit_peer_review(
        review_id=request.individual_review_id,
        reviewer_id=reviewer_id,
        responses=data.responses.model_dump(),
        is_anonymous=data.is_anonymous,
        linked_goals=data.linked_goals,
        linked_contributions=data.linked_contributions,
    )
    return ReviewSubmissionResponse.model_validate(submission)


# ============ Goal Endpoints ============

@router.post("/goals", response_model=WorkGoalResponse)
async def create_goal(
    developer_id: str,
    workspace_id: str,
    data: WorkGoalCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new SMART goal."""
    service = GoalService(db)
    goal = await service.create_goal(
        developer_id=developer_id,
        workspace_id=workspace_id,
        title=data.title,
        description=data.description,
        specific=data.specific,
        measurable=data.measurable,
        achievable=data.achievable,
        relevant=data.relevant,
        time_bound=data.time_bound,
        goal_type=data.goal_type.value,
        priority=data.priority.value,
        is_private=data.is_private,
        key_results=[kr.model_dump() for kr in data.key_results],
        tracking_keywords=data.tracking_keywords,
        review_cycle_id=data.review_cycle_id,
        learning_milestone_id=data.learning_milestone_id,
    )
    return WorkGoalResponse.model_validate(goal)


@router.get("/goals", response_model=list[WorkGoalResponse])
async def list_goals(
    developer_id: str,
    workspace_id: str | None = None,
    status: str | None = None,
    goal_type: str | None = None,
    review_cycle_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List goals for a developer."""
    service = GoalService(db)
    goals = await service.list_goals(
        developer_id=developer_id,
        workspace_id=workspace_id,
        status=status,
        goal_type=goal_type,
        review_cycle_id=review_cycle_id,
    )
    return [WorkGoalResponse.model_validate(g) for g in goals]


@router.get("/goals/{goal_id}", response_model=WorkGoalDetailResponse)
async def get_goal(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get goal details with linked contributions."""
    service = GoalService(db)
    goal = await service.get_goal(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Get linked contributions
    contributions = await service.get_linked_contributions(goal_id)

    return WorkGoalDetailResponse(
        **WorkGoalResponse.model_validate(goal).model_dump(),
        linked_commits=[
            {"sha": c.id, "title": c.title, "additions": c.additions, "deletions": c.deletions}
            for c in contributions if c.type == "commit"
        ],
        linked_pull_requests=[
            {"id": c.id, "title": c.title, "additions": c.additions, "deletions": c.deletions, "url": c.url}
            for c in contributions if c.type == "pull_request"
        ],
    )


@router.put("/goals/{goal_id}", response_model=WorkGoalResponse)
async def update_goal(
    goal_id: str,
    data: WorkGoalUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a goal."""
    service = GoalService(db)
    updates = data.model_dump(exclude_unset=True)

    # Convert enums to strings
    if "goal_type" in updates and updates["goal_type"]:
        updates["goal_type"] = updates["goal_type"].value
    if "priority" in updates and updates["priority"]:
        updates["priority"] = updates["priority"].value
    if "status" in updates and updates["status"]:
        updates["status"] = updates["status"].value

    goal = await service.update_goal(goal_id, **updates)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return WorkGoalResponse.model_validate(goal)


@router.put("/goals/{goal_id}/progress", response_model=WorkGoalResponse)
async def update_goal_progress(
    goal_id: str,
    data: GoalProgressUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update goal progress and key results."""
    service = GoalService(db)
    goal = await service.update_progress(
        goal_id=goal_id,
        progress_percentage=data.progress_percentage,
        key_result_updates=[kr.model_dump() for kr in data.key_result_updates] if data.key_result_updates else None,
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return WorkGoalResponse.model_validate(goal)


@router.post("/goals/{goal_id}/auto-link")
async def auto_link_contributions(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Auto-link GitHub activity to goal based on tracking keywords."""
    service = GoalService(db)
    result = await service.auto_link_contributions(goal_id)
    return {
        "linked_commits": len(result["commits"]),
        "linked_pull_requests": len(result["pull_requests"]),
        "commits": result["commits"],
        "pull_requests": result["pull_requests"],
    }


@router.get("/goals/{goal_id}/linked-contributions", response_model=LinkedContributionsResponse)
async def get_linked_contributions(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get linked contributions for a goal."""
    service = GoalService(db)
    goal = await service.get_goal(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    contributions = await service.get_linked_contributions(goal_id)

    total_additions = sum(c.additions for c in contributions)
    total_deletions = sum(c.deletions for c in contributions)

    return LinkedContributionsResponse(
        goal_id=goal_id,
        commits=[
            {"sha": c.id, "title": c.title, "additions": c.additions, "deletions": c.deletions}
            for c in contributions if c.type == "commit"
        ],
        pull_requests=[
            {"id": c.id, "title": c.title, "additions": c.additions, "deletions": c.deletions, "url": c.url}
            for c in contributions if c.type == "pull_request"
        ],
        total_additions=total_additions,
        total_deletions=total_deletions,
    )


@router.post("/goals/{goal_id}/complete", response_model=WorkGoalResponse)
async def complete_goal(
    goal_id: str,
    data: GoalCompletionData | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Mark a goal as completed."""
    service = GoalService(db)
    goal = await service.complete_goal(
        goal_id=goal_id,
        final_notes=data.final_notes if data else None,
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return WorkGoalResponse.model_validate(goal)


@router.get("/goals/suggestions", response_model=list[GoalSuggestion])
async def get_goal_suggestions(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get goal suggestions from active learning path."""
    service = GoalService(db)
    suggestions = await service.suggest_goals_from_learning_path(developer_id)
    return [
        GoalSuggestion(
            title=s.title,
            goal_type=s.goal_type,
            suggested_measurable=s.suggested_measurable,
            suggested_keywords=s.suggested_keywords,
            learning_milestone_id=s.learning_milestone_id,
            skill_name=s.skill_name,
        )
        for s in suggestions
    ]


# ============ Contribution Summary Endpoints ============

@router.get("/contributions/summary", response_model=ContributionSummaryResponse)
async def get_contribution_summary(
    developer_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
    period_type: str = "annual",
    db: AsyncSession = Depends(get_db),
):
    """Get or generate contribution summary for a developer."""
    llm = get_llm_gateway()
    service = ContributionService(db, llm)

    summary = await service.get_contribution_summary(
        developer_id=developer_id,
        period_start=period_start,
        period_end=period_end,
        period_type=period_type,
    )

    if not summary:
        raise HTTPException(status_code=404, detail="Could not generate contribution summary")

    return ContributionSummaryResponse.model_validate(summary)


@router.post("/contributions/generate", response_model=ContributionSummaryResponse)
async def generate_contribution_summary(
    developer_id: str,
    data: ContributionSummaryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Force generate a new contribution summary."""
    llm = get_llm_gateway()
    service = ContributionService(db, llm)

    period_start = data.period_start or date(date.today().year, 1, 1)
    period_end = data.period_end or date.today()

    summary = await service.generate_contribution_summary(
        developer_id=developer_id,
        period_start=period_start,
        period_end=period_end,
        period_type=data.period_type.value,
    )

    return ContributionSummaryResponse.model_validate(summary)


@router.get("/contributions/highlights", response_model=list[ContributionHighlight])
async def get_contribution_highlights(
    developer_id: str,
    period_start: date,
    period_end: date,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """Get notable contributions for a period."""
    service = ContributionService(db)
    highlights = await service.get_contribution_highlights(
        developer_id=developer_id,
        period_start=period_start,
        period_end=period_end,
        limit=limit,
    )
    return [
        ContributionHighlight(
            type=h.type,
            id=h.id,
            title=h.title,
            impact=h.impact,
            additions=h.additions,
            deletions=h.deletions,
            url=h.url,
        )
        for h in highlights
    ]
