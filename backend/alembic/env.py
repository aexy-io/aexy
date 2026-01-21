import sys
from pathlib import Path
from logging.config import fileConfig
import os

from sqlalchemy import create_engine, pool
from alembic import context

# --------------------------------------------------
# Add src/ to PYTHONPATH
# --------------------------------------------------
BASE_DIR = Path(__file__).resolve().parents[1]   # backend/
SRC_DIR = BASE_DIR / "src"
sys.path.insert(0, str(SRC_DIR))

# --------------------------------------------------
# Import Base + models
# --------------------------------------------------
from aexy.core.database import Base
import aexy.models  # registers all models

# Alembic config
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Required for autogenerate
target_metadata = Base.metadata


def get_database_url():
    """
    Alembic MUST use a SYNC driver.
    """
    url = "postgresql+psycopg2://postgres:postgres@postgres:5432/aexy"
    if not url:
        raise RuntimeError("ALEMBIC_DATABASE_URL is not set")
    return url


def run_migrations_offline():
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = create_engine(
        get_database_url(),
        poolclass=pool.NullPool,
    )
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
