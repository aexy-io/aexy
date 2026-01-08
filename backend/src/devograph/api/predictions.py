"""Predictive analytics API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.analytics import (
    AttritionRiskAnalysis,
    BurnoutRiskAssessment,
    PerformanceTrajectory,
    TeamHealthAnalysis,
    TeamHealthRequest,
    PredictiveInsightResponse,
)
from aexy.services.predictive_analytics import PredictiveAnalyticsService
from aexy.llm.gateway import get_llm_gateway

router = APIRouter(prefix="/predictions")


def get_predictive_service() -> PredictiveAnalyticsService:
    """Get predictive analytics service with LLM gateway."""
    llm_gateway = get_llm_gateway()
    return PredictiveAnalyticsService(llm_gateway=llm_gateway)


@router.get("/attrition/{developer_id}", response_model=AttritionRiskAnalysis)
async def get_attrition_risk(
    developer_id: str,
    days: int = Query(90, ge=30, le=180, description="Days of activity to analyze"),
    use_cache: bool = Query(True, description="Use cached result if available"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> AttritionRiskAnalysis:
    """Analyze attrition risk for a developer.

    Uses LLM to analyze activity patterns and identify potential disengagement.

    - **risk_level**: low, moderate, high, or critical
    - **risk_score**: 0.0-1.0 probability score
    - **factors**: Contributing factors with evidence
    - **recommendations**: Suggested interventions
    """
    service = get_predictive_service()

    try:
        result = await service.analyze_attrition_risk(
            developer_id=developer_id,
            db=db,
            days=days,
            use_cache=use_cache,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze attrition risk: {str(e)}",
        )


@router.get("/burnout/{developer_id}", response_model=BurnoutRiskAssessment)
async def get_burnout_risk(
    developer_id: str,
    days: int = Query(30, ge=7, le=90, description="Days of activity to analyze"),
    use_cache: bool = Query(True, description="Use cached result if available"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> BurnoutRiskAssessment:
    """Assess burnout risk for a developer.

    Analyzes work patterns, hours, and output for burnout indicators.

    - **risk_level**: low, moderate, high, or critical
    - **work_patterns**: Observed work pattern analysis
    - **recommendations**: Wellness recommendations
    """
    service = get_predictive_service()

    try:
        result = await service.assess_burnout_risk(
            developer_id=developer_id,
            db=db,
            days=days,
            use_cache=use_cache,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assess burnout risk: {str(e)}",
        )


@router.get("/trajectory/{developer_id}", response_model=PerformanceTrajectory)
async def get_performance_trajectory(
    developer_id: str,
    months: int = Query(6, ge=3, le=12, description="Months to predict ahead"),
    use_cache: bool = Query(True, description="Use cached result if available"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> PerformanceTrajectory:
    """Predict performance trajectory for a developer.

    Projects skill growth and career readiness based on current patterns.

    - **trajectory**: accelerating, steady, plateauing, or declining
    - **predicted_growth**: Expected skill improvements
    - **career_readiness**: Readiness for next career level
    """
    service = get_predictive_service()

    try:
        result = await service.predict_performance_trajectory(
            developer_id=developer_id,
            db=db,
            months=months,
            use_cache=use_cache,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to predict trajectory: {str(e)}",
        )


@router.post("/team-health", response_model=TeamHealthAnalysis)
async def get_team_health(
    request: TeamHealthRequest,
    use_cache: bool = Query(True, description="Use cached result if available"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> TeamHealthAnalysis:
    """Analyze overall team health.

    Comprehensive team assessment including:
    - Overall health score and grade
    - Strengths and risks
    - Capacity assessment
    - Collaboration patterns
    - Hiring recommendations

    - **health_grade**: A, B, C, D, or F
    - **risks**: Identified team risks with severity
    - **capacity_assessment**: Team bandwidth analysis
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = get_predictive_service()

    try:
        result = await service.analyze_team_health(
            developer_ids=request.developer_ids,
            db=db,
            team_id=request.team_id,
            use_cache=use_cache,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze team health: {str(e)}",
        )


@router.get("/insights/{developer_id}", response_model=list[PredictiveInsightResponse])
async def get_developer_insights(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> list[PredictiveInsightResponse]:
    """Get all cached predictive insights for a developer.

    Returns any existing attrition, burnout, and trajectory analyses.
    """
    service = get_predictive_service()
    insights = await service.get_all_cached_insights(
        developer_id=developer_id,
        db=db,
    )
    return insights


@router.post("/insights/refresh/{developer_id}")
async def refresh_developer_insights(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> dict:
    """Refresh all predictive insights for a developer.

    Forces recalculation of all predictions regardless of cache.
    """
    service = get_predictive_service()

    results = {}
    errors = []

    try:
        results["attrition"] = await service.analyze_attrition_risk(
            developer_id=developer_id,
            db=db,
            use_cache=False,
        )
    except Exception as e:
        errors.append(f"attrition: {str(e)}")

    try:
        results["burnout"] = await service.assess_burnout_risk(
            developer_id=developer_id,
            db=db,
            use_cache=False,
        )
    except Exception as e:
        errors.append(f"burnout: {str(e)}")

    try:
        results["trajectory"] = await service.predict_performance_trajectory(
            developer_id=developer_id,
            db=db,
            use_cache=False,
        )
    except Exception as e:
        errors.append(f"trajectory: {str(e)}")

    return {
        "developer_id": developer_id,
        "refreshed": list(results.keys()),
        "errors": errors if errors else None,
    }


@router.delete("/insights/{developer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_developer_insights(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> None:
    """Clear all cached insights for a developer."""
    service = get_predictive_service()
    await service.clear_cached_insights(
        developer_id=developer_id,
        db=db,
    )
