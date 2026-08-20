"""Turn an unhandled exception into a 500 that still carries its headers.

Starlette always puts `ServerErrorMiddleware` outermost — outside anything
`add_middleware` installs, `CORSMiddleware` included. So an exception that
escapes the router is answered by a response CORS never sees, and a browser
receives a 500 with no `Access-Control-Allow-Origin`. It cannot distinguish
that from a real cross-origin refusal, so it reports one:

    Access to XMLHttpRequest at '…' has been blocked by CORS policy:
    No 'Access-Control-Allow-Origin' header is present on the requested
    resource.

That message names the one part of the system that was working. It cost real
time once already — a `Content-Disposition` header that could not be encoded
surfaced to the client as a CORS misconfiguration, and CORS was fine.

Catching here, *inside* the CORS layer, means the 500 is an ordinary response
by the time CORS sees it and gets its headers like any other. The traceback is
not lost: it is logged with the method and path that produced it, which is more
than the ASGI server's own dump gives you.
"""

import logging

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class ErrorResponseMiddleware:
    """Answer an unhandled exception with a 500 the outer layers can decorate.

    Pure ASGI rather than `BaseHTTPMiddleware`: this sits in front of every
    response including streamed ones, and it needs to know whether the response
    has already started, which the raw protocol tells it directly.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception:
            logger.exception(
                "Unhandled error serving %s %s",
                scope.get("method", "?"),
                scope.get("path", "?"),
            )
            if response_started:
                # Headers are already on the wire; there is no status left to
                # set. Re-raise so the server tears the connection down rather
                # than appending a second response to a half-sent one.
                raise
            await JSONResponse(
                {"detail": "Internal server error"},
                status_code=500,
            )(scope, receive, send)
