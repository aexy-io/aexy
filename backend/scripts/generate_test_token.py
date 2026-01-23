#!/usr/bin/env python3
"""Generate a test JWT token for API testing.

Usage:
    # Generate token for a specific developer ID
    python scripts/generate_test_token.py <developer_id>

    # Generate token for first developer in database
    python scripts/generate_test_token.py --first

    # List available developers
    python scripts/generate_test_token.py --list
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from jose import jwt
from sqlalchemy import select, text

from aexy.core.config import get_settings
from aexy.core.database import async_session_maker


settings = get_settings()


def create_access_token(developer_id: str, expire_days: int = 30) -> str:
    """Create a JWT access token for testing."""
    expire = datetime.now(timezone.utc) + timedelta(days=expire_days)
    to_encode = {
        "sub": developer_id,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


async def list_developers():
    """List all developers in the database."""
    async with async_session_maker() as session:
        result = await session.execute(
            text("SELECT id, email, name FROM developers ORDER BY created_at DESC LIMIT 20")
        )
        developers = result.fetchall()

        if not developers:
            print("No developers found in database.")
            print("\nTo create a developer, sign in via the web app first.")
            return None

        print("\nAvailable developers:")
        print("-" * 80)
        for dev in developers:
            print(f"  ID: {dev.id}")
            print(f"  Email: {dev.email}")
            print(f"  Name: {dev.name or 'N/A'}")
            print("-" * 80)

        return developers


async def get_first_developer_id() -> str | None:
    """Get the first developer ID from database."""
    async with async_session_maker() as session:
        result = await session.execute(
            text("SELECT id FROM developers ORDER BY created_at LIMIT 1")
        )
        row = result.fetchone()
        return str(row.id) if row else None


async def main():
    parser = argparse.ArgumentParser(description="Generate test JWT tokens")
    parser.add_argument("developer_id", nargs="?", help="Developer UUID to generate token for")
    parser.add_argument("--first", action="store_true", help="Use the first developer in database")
    parser.add_argument("--list", action="store_true", help="List available developers")
    parser.add_argument("--days", type=int, default=30, help="Token expiration in days (default: 30)")

    args = parser.parse_args()

    if args.list:
        await list_developers()
        return

    developer_id = args.developer_id

    if args.first or not developer_id:
        developer_id = await get_first_developer_id()
        if not developer_id:
            print("Error: No developers found in database.")
            print("Please sign in via the web app first to create a developer account.")
            sys.exit(1)
        print(f"Using first developer: {developer_id}")

    token = create_access_token(developer_id, args.days)

    print(f"\n{'=' * 60}")
    print("Generated Test Token")
    print(f"{'=' * 60}")
    print(f"Developer ID: {developer_id}")
    print(f"Expires in: {args.days} days")
    print(f"{'=' * 60}")
    print(f"\nToken:\n{token}")
    print(f"\n{'=' * 60}")
    print("\nUsage examples:")
    print(f'  curl -H "Authorization: Bearer {token[:50]}..." http://localhost:8000/api/v1/developers/me')
    print(f'\n  export AEXY_TEST_TOKEN="{token}"')
    print(f'  curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" http://localhost:8000/api/v1/developers/me')


if __name__ == "__main__":
    asyncio.run(main())
