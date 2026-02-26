"""Provider Registry — manages GTM provider instances by slot and name.

Usage:
    registry = ProviderRegistry()
    registry.register("visitor_identification", "snitcher", SnitcherProvider)

    provider = await registry.get_provider(db, workspace_id, "visitor_identification")
    result = await provider.identify(ip_address)
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Type

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.encryption import decrypt_credentials
from aexy.models.gtm import GTMProviderConfig

logger = logging.getLogger(__name__)


class BaseProvider(ABC):
    """Abstract base class for all GTM providers."""

    # Subclasses must set these
    SLOT: str = ""
    NAME: str = ""
    DISPLAY_NAME: str = ""
    MONTHLY_COST_CENTS: int = 0  # for display
    REQUIRED_CREDENTIALS: list[str] = []

    def __init__(self, credentials: dict[str, Any], config: dict[str, Any] | None = None):
        self.credentials = credentials
        self.config = config or {}

    @abstractmethod
    async def test_connection(self) -> dict[str, Any]:
        """Test that the provider credentials are valid.

        Returns:
            dict with 'success' (bool) and 'message' (str)
        """
        ...

    @classmethod
    def validate_credentials(cls, credentials: dict[str, Any]) -> list[str]:
        """Validate that all required credential fields are present.

        Returns:
            List of missing field names (empty if valid).
        """
        missing = [f for f in cls.REQUIRED_CREDENTIALS if not credentials.get(f)]
        return missing


class ProviderRegistry:
    """Registry of available GTM providers, keyed by (slot, name)."""

    _providers: dict[tuple[str, str], Type[BaseProvider]] = {}

    @classmethod
    def register(cls, slot: str, name: str, provider_class: Type[BaseProvider]) -> None:
        """Register a provider class."""
        cls._providers[(slot, name)] = provider_class

    @classmethod
    def get_class(cls, slot: str, name: str) -> Type[BaseProvider] | None:
        """Get a registered provider class."""
        return cls._providers.get((slot, name))

    @classmethod
    def list_available(cls, slot: str | None = None) -> list[dict[str, Any]]:
        """List all registered providers, optionally filtered by slot."""
        results = []
        for (s, n), klass in cls._providers.items():
            if slot and s != slot:
                continue
            results.append({
                "slot": s,
                "name": n,
                "display_name": klass.DISPLAY_NAME,
                "monthly_cost_cents": klass.MONTHLY_COST_CENTS,
                "required_credentials": klass.REQUIRED_CREDENTIALS,
            })
        return results

    @classmethod
    async def get_provider(
        cls,
        db: AsyncSession,
        workspace_id: str,
        slot: str,
        provider_name: str | None = None,
    ) -> BaseProvider | None:
        """Instantiate a provider from stored config.

        If provider_name is None, uses the default provider for the slot.
        """
        if provider_name:
            query = select(GTMProviderConfig).where(
                and_(
                    GTMProviderConfig.workspace_id == workspace_id,
                    GTMProviderConfig.slot == slot,
                    GTMProviderConfig.provider_name == provider_name,
                    GTMProviderConfig.is_active == True,
                )
            )
        else:
            # Get default for slot
            query = select(GTMProviderConfig).where(
                and_(
                    GTMProviderConfig.workspace_id == workspace_id,
                    GTMProviderConfig.slot == slot,
                    GTMProviderConfig.is_default == True,
                    GTMProviderConfig.is_active == True,
                )
            )

        result = await db.execute(query)
        config = result.scalar_one_or_none()
        if not config:
            return None

        klass = cls._providers.get((slot, config.provider_name))
        if not klass:
            logger.warning(f"No provider class registered for ({slot}, {config.provider_name})")
            return None

        credentials = decrypt_credentials(config.credentials)
        return klass(credentials=credentials, config=config.config)

    @classmethod
    def slots(cls) -> list[str]:
        """List all known slots."""
        return sorted(set(s for s, _ in cls._providers.keys()))
