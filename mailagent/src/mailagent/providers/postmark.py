"""Postmark email provider."""

import httpx

from mailagent.providers.base import (
    EmailProvider,
    ProviderType,
    ProviderConfig,
    EmailMessage,
    SendResult,
)


class PostmarkProvider(EmailProvider):
    """Postmark email provider."""

    BASE_URL = "https://api.postmarkapp.com"

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self._server_token = self._get_credential('server_token')

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.POSTMARK

    async def send(self, message: EmailMessage) -> SendResult:
        """Send email via Postmark."""
        try:
            payload = self._build_payload(message)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/email",
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-Postmark-Server-Token": self._server_token,
                    },
                    json=payload,
                    timeout=30.0,
                )

                if response.status_code == 200:
                    result = response.json()
                    message_id = result.get("MessageID", "")

                    return SendResult(
                        success=True,
                        message_id=message_id,
                        provider='postmark',
                        provider_message_id=message_id,
                    )
                else:
                    error_body = response.json() if response.content else {}
                    error_msg = error_body.get("Message", response.text)

                    return SendResult(
                        success=False,
                        provider='postmark',
                        error=f"HTTP {response.status_code}: {error_msg}",
                    )

        except Exception as e:
            return SendResult(
                success=False,
                provider='postmark',
                error=str(e),
            )

    async def verify_credentials(self) -> bool:
        """Verify Postmark credentials by fetching server info."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/server",
                    headers={
                        "Accept": "application/json",
                        "X-Postmark-Server-Token": self._server_token,
                    },
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception:
            return False

    async def send_batch(self, messages: list[EmailMessage]) -> list[SendResult]:
        """Send multiple emails via Postmark batch API (up to 500 per call)."""
        results = []
        # Postmark allows up to 500 messages per batch call
        batch_size = 500

        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            batch_payloads = [self._build_payload(msg) for msg in batch]

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.BASE_URL}/email/batch",
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "X-Postmark-Server-Token": self._server_token,
                        },
                        json=batch_payloads,
                        timeout=60.0,
                    )

                    if response.status_code == 200:
                        batch_results = response.json()
                        for item in batch_results:
                            if item.get("ErrorCode", 0) == 0:
                                results.append(SendResult(
                                    success=True,
                                    message_id=item.get("MessageID", ""),
                                    provider='postmark',
                                    provider_message_id=item.get("MessageID", ""),
                                ))
                            else:
                                results.append(SendResult(
                                    success=False,
                                    provider='postmark',
                                    error=item.get("Message", "Unknown error"),
                                ))
                    else:
                        error_body = response.json() if response.content else {}
                        error_msg = error_body.get("Message", response.text)
                        # All messages in this batch failed
                        for _ in batch:
                            results.append(SendResult(
                                success=False,
                                provider='postmark',
                                error=f"HTTP {response.status_code}: {error_msg}",
                            ))

            except Exception as e:
                for _ in batch:
                    results.append(SendResult(
                        success=False,
                        provider='postmark',
                        error=str(e),
                    ))

        return results

    def _build_payload(self, message: EmailMessage) -> dict:
        """Build Postmark API payload from EmailMessage."""
        payload: dict = {
            "From": message.from_address.formatted(),
            "To": ", ".join(addr.formatted() for addr in message.to_addresses),
            "Subject": message.subject,
        }

        # CC
        if message.cc_addresses:
            payload["Cc"] = ", ".join(addr.formatted() for addr in message.cc_addresses)

        # BCC
        if message.bcc_addresses:
            payload["Bcc"] = ", ".join(addr.formatted() for addr in message.bcc_addresses)

        # Reply-To
        if message.reply_to:
            payload["ReplyTo"] = message.reply_to.formatted()

        # Content
        if message.body_html:
            payload["HtmlBody"] = message.body_html
        if message.body_text:
            payload["TextBody"] = message.body_text

        # Headers (including threading)
        custom_headers = []
        if message.headers:
            custom_headers.extend(
                {"Name": k, "Value": v} for k, v in message.headers.items()
            )
        if message.in_reply_to:
            custom_headers.append({"Name": "In-Reply-To", "Value": message.in_reply_to})
        if message.references:
            custom_headers.append({"Name": "References", "Value": " ".join(message.references)})
        if custom_headers:
            payload["Headers"] = custom_headers

        # Tracking
        payload["TrackOpens"] = message.track_opens
        if message.track_clicks:
            payload["TrackLinks"] = "HtmlAndText"

        # Tags (Postmark supports a single Tag string)
        if message.tags:
            payload["Tag"] = message.tags[0]

        # Metadata
        if message.metadata:
            payload["Metadata"] = {k: str(v) for k, v in message.metadata.items()}

        # Attachments
        if message.attachments:
            import base64
            payload["Attachments"] = [
                {
                    "Name": att.filename,
                    "Content": base64.b64encode(att.content).decode(),
                    "ContentType": att.content_type,
                    **({"ContentID": f"cid:{att.content_id}"} if att.content_id else {}),
                }
                for att in message.attachments
            ]

        return payload
