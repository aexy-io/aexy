"""Email provider factory."""

from typing import Optional

from mailagent.providers.base import EmailProvider, ProviderConfig, ProviderType
from mailagent.providers.ses import SESProvider
from mailagent.providers.sendgrid import SendGridProvider
from mailagent.providers.postmark import PostmarkProvider


PROVIDER_CLASSES = {
    ProviderType.SES: SESProvider,
    ProviderType.SENDGRID: SendGridProvider,
    ProviderType.POSTMARK: PostmarkProvider,
}


def get_email_provider(config: ProviderConfig) -> EmailProvider:
    """Get an email provider instance from configuration.

    Args:
        config: Provider configuration with type and credentials

    Returns:
        EmailProvider instance

    Raises:
        ValueError: If provider type is not supported
    """
    provider_class = PROVIDER_CLASSES.get(config.provider_type)

    if not provider_class:
        raise ValueError(
            f"Unsupported provider type: {config.provider_type}. "
            f"Supported: {list(PROVIDER_CLASSES.keys())}"
        )

    return provider_class(config)


async def create_and_verify_provider(config: ProviderConfig) -> tuple[EmailProvider, bool]:
    """Create a provider and verify its credentials.

    Args:
        config: Provider configuration

    Returns:
        Tuple of (provider instance, credentials_valid)
    """
    provider = get_email_provider(config)
    is_valid = await provider.verify_credentials()
    return provider, is_valid
