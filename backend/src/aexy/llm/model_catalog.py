"""Models an admin can pick from, per provider.

**A convenience, not an authority.** Model ids are the provider's to define and
they change faster than any list in this repository can track, so free text is
first class: ``normalise_model`` checks the *shape* and nothing else. A model
this file has never heard of is usable the day it ships, and an id that does not
exist fails loudly on the first call — which is a better outcome than a stale
allowlist refusing something released last week.

The curated entries exist so the common choice is one click rather than a
remembered string, and so the picker can say what a model is *for*. Where this
file is uncertain, it says so in the entry rather than guessing — the whole point
of the configuration page is that an admin can see the real answer, and a
confidently wrong list would undo that.

The ids marked "in use here" are the ones this codebase already defaults to
(each provider class's ``DEFAULT_MODEL``), so they are known to work against
this integration rather than merely plausible.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# Letters, digits and the separators providers actually use in model ids
# (`claude-sonnet-5`, `openai/gpt-4o`, `qwen/qwen3.5-9b`, `codellama:13b`).
_VALID_MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")

MODEL_MAX_LENGTH = 128


def normalise_model(value: Any) -> str | None:
    """A usable model id, or None when the input is not one.

    Shape only. See the module docstring for why there is deliberately no
    allowlist check here.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    return candidate if _VALID_MODEL.match(candidate) else None


@dataclass(frozen=True)
class CatalogEntry:
    """One suggested model."""

    id: str
    label: str
    note: str
    """When to reach for it. Shown under the option, because "gpt-4o-mini" tells
    an admin nothing about whether it belongs on contract editing."""

    in_use_here: bool = False
    """True when this is a default this codebase already ships, so it is known to
    work against this integration rather than merely plausible."""


# Keyed by the provider name `LLMConfig.provider` uses.
CATALOG: dict[str, tuple[CatalogEntry, ...]] = {
    "claude": (
        CatalogEntry(
            id="claude-opus-5",
            label="Claude Opus 5",
            note="The strongest, and the slowest. For work somebody signs off on.",
        ),
        CatalogEntry(
            id="claude-sonnet-5",
            label="Claude Sonnet 5",
            note="The balanced default. A good answer for most features here.",
        ),
        CatalogEntry(
            id="claude-haiku-4-5-20251001",
            label="Claude Haiku 4.5",
            note="Fast and cheap. For high-volume classification and summarising.",
        ),
        CatalogEntry(
            id="claude-sonnet-4-20250514",
            label="Claude Sonnet 4",
            note="The previous generation. Pin this only to keep output stable.",
            in_use_here=True,
        ),
    ),
    "gemini": (
        CatalogEntry(
            id="gemini-2.0-flash",
            label="Gemini 2.0 Flash",
            note="Fast and inexpensive, and what this deployment falls back to.",
            in_use_here=True,
        ),
    ),
    "openai": (
        CatalogEntry(
            id="gpt-4o",
            label="GPT-4o",
            note="The general-purpose choice.",
        ),
        CatalogEntry(
            id="gpt-4o-mini",
            label="GPT-4o mini",
            note="Cheap and quick, for volume work.",
            in_use_here=True,
        ),
    ),
    "deepseek": (
        CatalogEntry(
            id="deepseek-chat",
            label="DeepSeek Chat",
            note="The general-purpose model.",
            in_use_here=True,
        ),
        CatalogEntry(
            id="deepseek-reasoner",
            label="DeepSeek Reasoner",
            note="Slower, and better at problems needing several steps.",
        ),
    ),
    "openrouter": (
        CatalogEntry(
            id="openai/gpt-4o",
            label="GPT-4o (via OpenRouter)",
            note="OpenRouter ids are `vendor/model`. Anything it routes works here.",
            in_use_here=True,
        ),
    ),
    "ollama": (
        CatalogEntry(
            id="codellama:13b",
            label="CodeLlama 13B",
            note="Local. Whatever you have pulled with `ollama pull` will work.",
            in_use_here=True,
        ),
    ),
    "lmstudio": (
        CatalogEntry(
            id="qwen/qwen3.5-9b",
            label="Qwen 3.5 9B",
            note="Local. Must be the model LM Studio currently has loaded.",
            in_use_here=True,
        ),
    ),
}


def catalog_for(provider: str) -> tuple[CatalogEntry, ...]:
    """Suggestions for one provider.

    An empty tuple for a provider this file has no entries for, which the picker
    should render as a free-text field rather than as an error — the list is a
    convenience and its absence costs discoverability, not function.
    """
    return CATALOG.get((provider or "").lower().strip(), ())
