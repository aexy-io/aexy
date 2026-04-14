"""Live compatibility check for the currently-configured LLM provider.

Usage:
    # Verify the provider set by LLM_PROVIDER / LLM_MODEL in .env
    docker exec aexy-backend python scripts/check_llm_provider.py

    # Override for a single run (e.g. quick DeepSeek smoke test)
    docker exec -e LLM_PROVIDER=deepseek -e LLM_MODEL=deepseek-chat \
        -e DEEPSEEK_API_KEY=sk-... aexy-backend \
        python scripts/check_llm_provider.py

What it does:
    1. Loads the gateway via get_llm_gateway() — same code path production uses.
    2. Runs: health_check → raw call_llm → analyze(CODE) → extract_task_signals.
    3. Prints pass/fail per step plus token usage. Exits non-zero on any failure.

This is the reference harness for validating any new provider or model swap.
It does not require the DB or Redis — rate limiting is bypassed.
"""

import asyncio
import json
import sys
import time
import traceback
from typing import Any, Callable, Awaitable

from aexy.llm.base import AnalysisRequest, AnalysisType
from aexy.llm.gateway import get_llm_gateway


GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"


def _ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def _fail(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}")


def _info(msg: str) -> None:
    print(f"  {YELLOW}·{RESET} {msg}")


async def _run_step(
    name: str,
    fn: Callable[[], Awaitable[Any]],
) -> tuple[bool, Any]:
    print(f"\n{BOLD}{name}{RESET}")
    t0 = time.perf_counter()
    try:
        result = await fn()
        dt = time.perf_counter() - t0
        _ok(f"passed in {dt:.2f}s")
        return True, result
    except Exception as e:  # noqa: BLE001
        dt = time.perf_counter() - t0
        _fail(f"failed after {dt:.2f}s: {e.__class__.__name__}: {e}")
        traceback.print_exc()
        return False, None


async def main() -> int:
    print(f"{BOLD}LLM provider compatibility check{RESET}")

    gateway = get_llm_gateway()
    if gateway is None:
        _fail(
            "get_llm_gateway() returned None — check LLM_PROVIDER and the "
            "corresponding *_API_KEY in your environment."
        )
        return 2

    _info(f"provider: {gateway.provider_name}")
    _info(f"model:    {gateway.model_name}")

    results: list[tuple[str, bool]] = []

    # 1. Health check
    ok, _ = await _run_step(
        "1/4 health_check()",
        lambda: gateway.provider.health_check(),
    )
    results.append(("health_check", ok))

    # 2. Raw chat call (bypasses rate limiter and DB)
    async def _call():
        text, total, in_tok, out_tok = await gateway.call_llm(
            system_prompt="You are a terse assistant. Answer in <=10 words.",
            user_prompt="Say 'DeepSeek compatibility check OK' and nothing else.",
            skip_rate_limit=True,
        )
        _info(f"tokens: input={in_tok} output={out_tok} total={total}")
        _info(f"reply:  {text[:200]!r}")
        if not text.strip():
            raise AssertionError("empty response")
        return text

    ok, _ = await _run_step("2/4 call_llm() — raw chat completion", _call)
    results.append(("call_llm", ok))

    # 3. Structured analysis (exercises JSON-mode parsing)
    async def _analyze():
        req = AnalysisRequest(
            analysis_type=AnalysisType.CODE,
            content=(
                "async def fetch(url: str) -> dict:\n"
                "    async with httpx.AsyncClient() as client:\n"
                "        r = await client.get(url)\n"
                "        return r.json()\n"
            ),
            file_path="fetcher.py",
            language_hint="python",
        )
        result = await gateway.analyze(req, use_cache=False, skip_rate_limit=True)
        _info(
            f"languages={[l.name for l in result.languages]} "
            f"frameworks={[f.name for f in result.frameworks]} "
            f"confidence={result.confidence:.2f}"
        )
        if result.input_tokens + result.output_tokens == 0:
            raise AssertionError("no token usage reported")
        return result

    ok, _ = await _run_step("3/4 analyze(CODE) — structured JSON analysis", _analyze)
    results.append(("analyze", ok))

    # 4. Task signal extraction
    async def _signals():
        task = json.dumps(
            {
                "title": "Add Redis-backed session cache to auth middleware",
                "description": (
                    "Replace in-process session cache with Redis so multiple "
                    "uvicorn workers share state. Keep the existing cookie format."
                ),
                "labels": ["backend", "auth", "redis"],
                "source": "github",
            }
        )
        signals = await gateway.extract_task_signals(
            task, use_cache=False, skip_rate_limit=True
        )
        _info(
            f"required={signals.required_skills} "
            f"domain={signals.domain} complexity={signals.complexity}"
        )
        if not signals.required_skills:
            raise AssertionError("no required_skills extracted")
        return signals

    ok, _ = await _run_step("4/4 extract_task_signals()", _signals)
    results.append(("extract_task_signals", ok))

    # Summary
    print(f"\n{BOLD}Summary{RESET}")
    passed = sum(1 for _, ok in results if ok)
    for name, ok in results:
        mark = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
        print(f"  {mark} {name}")
    print(f"\n{passed}/{len(results)} steps passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
