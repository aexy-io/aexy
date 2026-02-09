"""Questionnaire import models for compliance tracking.

This module provides models for:
- QuestionnaireResponse (uploaded questionnaire files)
- QuestionnaireQuestion (individual parsed questions)
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class QuestionnaireStatus(str, Enum):
    """Status of a questionnaire import."""
    UPLOADED = "uploaded"
    ANALYZED = "analyzed"
    REVIEWED = "reviewed"


class ResponseType(str, Enum):
    """Type of question response."""
    YES_NO = "yes_no"
    FREQUENCY = "frequency"
    TEXT = "text"
    MULTI_CHOICE = "multi_choice"


class QuestionnaireResponse(Base):
    """An uploaded questionnaire file.

    Tracks the imported file, its metadata, and analysis status.
    """

    __tablename__ = "questionnaire_responses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Document info
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    partner_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assessment_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(500), nullable=False)

    # Parsing stats
    total_questions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_suggestions_generated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        default=QuestionnaireStatus.UPLOADED.value,
        nullable=False,
    )

    # Extra metadata from document summary sheet
    extra_metadata: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Audit
    uploaded_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    uploaded_by: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
    questions: Mapped[list["QuestionnaireQuestion"]] = relationship(
        "QuestionnaireQuestion",
        back_populates="questionnaire_response",
        cascade="all, delete-orphan",
        lazy="select",
    )


class QuestionnaireQuestion(Base):
    """A single parsed question from a questionnaire.

    Stores the original question data and classification metadata.
    """

    __tablename__ = "questionnaire_questions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    questionnaire_response_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("questionnaire_responses.id", ondelete="CASCADE"),
        index=True,
    )

    # Question data
    serial_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    possible_responses: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Classification
    is_section_header: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    response_type: Mapped[str] = mapped_column(
        String(50),
        default=ResponseType.TEXT.value,
        nullable=False,
    )
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    questionnaire_response: Mapped["QuestionnaireResponse"] = relationship(
        "QuestionnaireResponse",
        back_populates="questions",
        lazy="selectin",
    )
