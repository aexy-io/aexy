"""The models and the migration have to build the same two tables.

There are two ways to get these tables: `create_all` from the models on startup,
and the SQL file for a database that already exists. Nothing checks that they
agree, and nothing fails when they don't — the cost surfaces later as a query
plan that is fine in development and wrong in production, or a column that is
NOT NULL in one place and nullable in the other.

This is the same check `test_document_comment_anchors.py` makes for its
migration, and for the same reason: these two sides already diverged once during
this change, when the models' `index=True` produced SQLAlchemy's names and the
migration invented its own.
"""

from __future__ import annotations

import re
from pathlib import Path

from aexy.models.document_impact import (
    PullRequestDocImpact,
    PullRequestDocImpactItem,
)
from aexy.models.workspace_doc_impact_settings import WorkspaceDocImpactSettings

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "migrate_pull_request_doc_impacts.sql"
)

TABLES = (PullRequestDocImpact, PullRequestDocImpactItem)

SETTINGS_MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "migrate_workspace_doc_impact_settings.sql"
)


def migration_sql() -> str:
    return MIGRATION.read_text()


def test_the_migration_exists_and_creates_both_tables():
    sql = migration_sql()
    created = set(
        re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", sql, re.IGNORECASE)
    )
    assert {model.__tablename__ for model in TABLES} <= created


def test_every_index_matches_by_name_in_both_directions():
    """Declared but not migrated means an existing database silently lacks it.
    Migrated but not declared means a fresh one does. Both are wrong."""
    in_migration = set(
        re.findall(
            r"CREATE INDEX (?:IF NOT EXISTS )?(\w+)", migration_sql(), re.IGNORECASE
        )
    )
    declared = set()
    for model in TABLES:
        declared |= {index.name for index in model.__table__.indexes}

    assert in_migration == declared, {
        "only in the migration": in_migration - declared,
        "only on the model": declared - in_migration,
    }


def test_every_column_appears_in_the_migration():
    """Named individually rather than by counting, so a rename is caught too."""
    sql = migration_sql()
    for model in TABLES:
        for column in model.__table__.columns:
            assert re.search(rf"\b{re.escape(column.name)}\b", sql), (
                f"{model.__tablename__}.{column.name} is on the model but not in "
                "the migration"
            )


def test_the_unique_constraints_are_in_both():
    sql = migration_sql()
    for model in TABLES:
        for constraint in model.__table__.constraints:
            name = getattr(constraint, "name", None)
            if name and name.startswith("uq_"):
                assert name in sql, f"{name} is declared but never migrated"


class TestTheDecisionsWorthPinning:
    def test_losing_an_author_does_not_delete_the_record(self):
        """SET NULL, never CASCADE. Which pages a merge left behind must outlive
        the person who merged it — otherwise offboarding quietly erases the
        documentation debt they created."""
        for column_name in ("author_developer_id",):
            fk = next(
                iter(PullRequestDocImpact.__table__.c[column_name].foreign_keys)
            )
            assert fk.ondelete == "SET NULL"

        fk = next(
            iter(
                PullRequestDocImpactItem.__table__.c[
                    "dismissed_by_developer_id"
                ].foreign_keys
            )
        )
        assert fk.ondelete == "SET NULL"

    def test_a_missing_local_pull_request_row_is_survivable(self):
        """The evaluation can beat ingestion to the commit. Nullable, SET NULL —
        losing that race must not lose the evaluation."""
        column = PullRequestDocImpact.__table__.c["pull_request_id"]
        assert column.nullable is True
        assert next(iter(column.foreign_keys)).ondelete == "SET NULL"

    def test_one_impact_row_per_pull_request(self):
        """The upsert key. Without it a re-delivered webhook makes a second row,
        and the second row has its own idea of what the author has been told."""
        names = {
            getattr(c, "name", None) for c in PullRequestDocImpact.__table__.constraints
        }
        assert "uq_pr_doc_impact" in names

    def test_one_item_per_document_per_pull_request(self):
        """A document watching two paths is still one page to read."""
        names = {
            getattr(c, "name", None)
            for c in PullRequestDocImpactItem.__table__.constraints
        }
        assert "uq_pr_doc_impact_item" in names

    def test_the_high_water_mark_defaults_to_empty_not_null(self):
        """Every read of it does set arithmetic. A null would mean each of those
        needed a guard, and the one that forgot would re-notify."""
        column = PullRequestDocImpact.__table__.c["notified_document_ids"]
        assert column.nullable is False
        assert column.default is not None

    def test_the_item_carries_its_workspace(self):
        """Denormalised from the document on purpose: a repository adopted by two
        workspaces must not show one's pages on the other's page, and that filter
        has to be cheap enough to be applied on every read."""
        column = PullRequestDocImpactItem.__table__.c["workspace_id"]
        assert column.nullable is False
        assert next(iter(column.foreign_keys)).ondelete == "CASCADE"

    def test_deleting_an_impact_takes_its_items(self):
        column = PullRequestDocImpactItem.__table__.c["impact_id"]
        assert next(iter(column.foreign_keys)).ondelete == "CASCADE"

    def test_the_migration_backfills_nothing(self):
        """A notification about a pull request that merged last month is spam,
        and a comment on it is worse. Every existing PR stays unevaluated.

        Comments are stripped before looking: this file explains the "no update
        needed" affordance in prose, and matching that would be the test finding
        its own documentation.
        """
        statements = "\n".join(
            re.sub(r"--.*$", "", line) for line in migration_sql().splitlines()
        ).upper()
        assert "INSERT INTO" not in statements
        assert not re.search(r"\bUPDATE\s+\w", statements)
        assert "DELETE FROM" not in statements


class TestTheSettingsTableAgreesWithItsMigration:
    """Same check, same reason — `create_all` and the SQL file must build one
    schema. The defaults matter more here than anywhere else in this change: they
    decide whether deploying it starts writing into customers' pull requests."""

    def test_every_column_is_in_the_migration(self):
        sql = SETTINGS_MIGRATION.read_text()
        for column in WorkspaceDocImpactSettings.__table__.columns:
            assert re.search(rf"\b{re.escape(column.name)}\b", sql), column.name

    def test_the_github_writes_default_off_on_both_sides(self):
        """A deploy must not begin commenting on anybody's pull requests. Asserted
        on the model *and* in the SQL, because an existing database gets its
        default from the file and a fresh one from the model."""
        sql = SETTINGS_MIGRATION.read_text()
        for column_name in ("pr_comment_enabled", "check_run_enabled"):
            column = WorkspaceDocImpactSettings.__table__.c[column_name]
            assert column.default.arg is False, column_name
            assert re.search(
                rf"{column_name}\s+BOOLEAN NOT NULL DEFAULT FALSE", sql, re.IGNORECASE
            ), column_name

    def test_the_notification_defaults_on(self):
        """It is not externally visible, and it is the point of the feature."""
        assert WorkspaceDocImpactSettings.__table__.c["enabled"].default.arg is True

    def test_the_check_never_blocks_a_merge_by_default(self):
        column = WorkspaceDocImpactSettings.__table__.c["check_run_conclusion"]
        assert column.default.arg == "neutral"

    def test_one_row_per_workspace(self):
        assert WorkspaceDocImpactSettings.__table__.c["workspace_id"].unique is True

    def test_it_backfills_nothing_either(self):
        """An absent row is the default. A row per workspace would only be
        something to keep in sync."""
        statements = "\n".join(
            re.sub(r"--.*$", "", line)
            for line in SETTINGS_MIGRATION.read_text().splitlines()
        ).upper()
        assert "INSERT INTO" not in statements
