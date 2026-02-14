"""Holiday service for managing company/public holidays."""

from datetime import date
from uuid import uuid4

from sqlalchemy import and_, select, extract
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import Holiday


class HolidayService:
    """Service for managing holidays."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        workspace_id: str,
        name: str,
        date: date,
        description: str | None = None,
        is_optional: bool = False,
        applicable_team_ids: list[str] | None = None,
    ) -> Holiday:
        """Create a new holiday."""
        holiday = Holiday(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            date=date,
            description=description,
            is_optional=is_optional,
            applicable_team_ids=applicable_team_ids or [],
        )
        self.db.add(holiday)
        await self.db.flush()
        await self.db.refresh(holiday)
        return holiday

    async def get_all(
        self, workspace_id: str, year: int | None = None
    ) -> list[Holiday]:
        """Get all holidays for a workspace, optionally filtered by year."""
        conditions = [Holiday.workspace_id == workspace_id]
        if year:
            conditions.append(extract("year", Holiday.date) == year)

        stmt = (
            select(Holiday)
            .where(and_(*conditions))
            .order_by(Holiday.date.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, holiday_id: str) -> Holiday | None:
        """Get a holiday by ID."""
        stmt = select(Holiday).where(Holiday.id == holiday_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_holidays_between(
        self, workspace_id: str, start_date: date, end_date: date
    ) -> list[Holiday]:
        """Get holidays between two dates."""
        stmt = (
            select(Holiday)
            .where(
                and_(
                    Holiday.workspace_id == workspace_id,
                    Holiday.date >= start_date,
                    Holiday.date <= end_date,
                )
            )
            .order_by(Holiday.date.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, holiday_id: str, **kwargs) -> Holiday | None:
        """Update a holiday."""
        holiday = await self.get_by_id(holiday_id)
        if not holiday:
            return None

        allowed = {"name", "date", "description", "is_optional", "applicable_team_ids"}
        for key, value in kwargs.items():
            if key in allowed:
                setattr(holiday, key, value)

        await self.db.flush()
        await self.db.refresh(holiday)
        return holiday

    async def delete(self, holiday_id: str) -> bool:
        """Delete a holiday."""
        holiday = await self.get_by_id(holiday_id)
        if not holiday:
            return False
        await self.db.delete(holiday)
        await self.db.flush()
        return True
