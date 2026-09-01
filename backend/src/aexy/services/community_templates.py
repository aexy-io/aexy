"""Starter templates: the shape a community begins life with.

A forum's first day is its hardest. The settings page could only ever offer an
empty checkbox — enable it, and land on a page with no channels, no threads, and
nothing for a visitor to read. Every forum that works started with a handful of
answers already on it, so this module is the catalogue of starting points.

**No template contains company-identifying data.** A template describes a
*shape*: the channels a support community separates its traffic into, the first
threads worth having before anyone arrives. The community's own name and
description come from the workspace when the template is applied.

Two rules:

* Applying a template never publishes anything by itself. It lays out channels
  and seeds threads; ``enabled`` stays under the operator's finger. The one
  exception is an explicit ``publish=True`` from the caller.
* Applying is idempotent. A channel whose slug already exists is left exactly as
  it is and reported as skipped — the same contract as
  ``ChatService.setup_default_channel``, so a second click is safe rather than
  duplicative.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SeedTopic:
    """A thread the template opens, with the post that starts it."""

    name: str
    first_message: str


@dataclass(frozen=True)
class TemplateChannel:
    name: str
    slug: str
    description: str
    topics: tuple[SeedTopic, ...] = ()


@dataclass(frozen=True)
class CommunityTemplate:
    id: str
    name: str
    description: str
    # Who this shape is for, shown under the name in the picker.
    audience: str
    channels: tuple[TemplateChannel, ...] = field(default_factory=tuple)
    # Participation defaults. Read them as the template's opinion about how open
    # this kind of community should be, not as a security boundary — the operator
    # sees and can change all three before anything goes live.
    allow_participation: bool = True
    allow_new_topics: bool = False
    post_moderation: str = "post"


PRODUCT_SUPPORT = CommunityTemplate(
    id="product_support",
    name="Product support",
    description=(
        "Answer a question once, in public, and let the next person find it. "
        "Separates announcements from questions so neither drowns the other."
    ),
    audience="Teams answering the same questions repeatedly over email",
    allow_participation=True,
    allow_new_topics=True,
    post_moderation="post",
    channels=(
        TemplateChannel(
            name="Announcements",
            slug="announcements",
            description="Releases, changes, and incidents. Read-only in practice.",
            topics=(
                SeedTopic(
                    name="Welcome — start here",
                    first_message=(
                        "This is where we post releases, changes, and anything "
                        "that affects how the product works.\n\n"
                        "Questions belong in #help — you'll get an answer faster "
                        "there, and the next person with the same question will "
                        "find it."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Help",
            slug="help",
            description="Questions and answers. Anyone can ask; anyone can answer.",
            topics=(
                SeedTopic(
                    name="How to ask a question that gets answered",
                    first_message=(
                        "Three things make the difference:\n\n"
                        "1. What you were trying to do.\n"
                        "2. What happened instead — the exact message, if there "
                        "was one.\n"
                        "3. What you already tried.\n\n"
                        "That's it. You don't need to apologise for asking."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Feature requests",
            slug="feature-requests",
            description="What's missing, and who else wants it.",
            topics=(
                SeedTopic(
                    name="How we handle feature requests",
                    first_message=(
                        "Open a thread per request, one request per thread. "
                        "Reactions on the first post are how we see how many "
                        "people want the same thing.\n\n"
                        "We won't promise dates. We will tell you when something "
                        "is not going to happen, which is more useful than "
                        "silence."
                    ),
                ),
            ),
        ),
    ),
)


OPEN_SOURCE = CommunityTemplate(
    id="open_source",
    name="Open-source project",
    description=(
        "A place for contributors that isn't the issue tracker: questions, "
        "design discussion, and what people built with it."
    ),
    audience="Maintainers whose issue tracker has become a support queue",
    allow_participation=True,
    allow_new_topics=True,
    post_moderation="post",
    channels=(
        TemplateChannel(
            name="General",
            slug="general",
            description="Anything that isn't a bug report.",
            topics=(
                SeedTopic(
                    name="Welcome",
                    first_message=(
                        "Issues are for bugs and tracked work. Everything else — "
                        "questions, half-formed ideas, \"is this the right way to "
                        "do X\" — belongs here, where it doesn't sit in a triage "
                        "queue looking overdue."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Contributing",
            slug="contributing",
            description="Getting set up, finding something to work on, review.",
            topics=(
                SeedTopic(
                    name="Your first contribution",
                    first_message=(
                        "Ask here before you write the patch, not after. A "
                        "five-minute exchange about the approach saves rewriting "
                        "an afternoon's work, and we would rather have that "
                        "exchange than reject a pull request you were proud of."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Show and tell",
            slug="show-and-tell",
            description="What you built with it.",
            topics=(
                SeedTopic(
                    name="What are you building?",
                    first_message=(
                        "Post it here — however small, however unfinished. Seeing "
                        "what people actually do with this changes what we build "
                        "next more than any roadmap survey has."
                    ),
                ),
            ),
        ),
    ),
)


SAAS_CUSTOMERS = CommunityTemplate(
    id="saas_customers",
    name="Customer community",
    description=(
        "A shared room for customers: what changed, how other people solved it, "
        "and where to ask. Pre-moderated, because customers post under their own "
        "names and their employer's."
    ),
    audience="B2B products whose customers ask each other, not just you",
    allow_participation=True,
    allow_new_topics=True,
    # Pre-moderation on by default here and nowhere else: a customer forum
    # carries named people from named companies, and the cost of one bad post
    # being visible for an hour is different when everyone is identifiable.
    post_moderation="pre",
    channels=(
        TemplateChannel(
            name="Announcements",
            slug="announcements",
            description="Releases, deprecations, and maintenance.",
            topics=(
                SeedTopic(
                    name="Welcome to the customer community",
                    first_message=(
                        "What goes where:\n\n"
                        "**#announcements** — us telling you what changed.\n"
                        "**#ask** — questions, to us or to each other.\n"
                        "**#integrations** — connecting this to the rest of your "
                        "stack.\n\n"
                        "Anything account-specific — billing, contracts, your "
                        "data — should go to support privately, not here."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Ask",
            slug="ask",
            description="Questions. Ours to answer, yours to answer for each other.",
            topics=(
                SeedTopic(
                    name="Before you post: nothing account-specific",
                    first_message=(
                        "This is a public page. Please don't paste API keys, "
                        "invoices, customer records, or anything else you would "
                        "not put on your own website.\n\n"
                        "If a question needs your account data to answer, open a "
                        "support ticket instead and we'll take it there."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Integrations",
            slug="integrations",
            description="Connecting this to the rest of your stack.",
            topics=(
                SeedTopic(
                    name="What are you connecting this to?",
                    first_message=(
                        "Tell us what you wired together and what got in the way. "
                        "The awkward parts are the useful part of the post."
                    ),
                ),
            ),
        ),
    ),
)


KNOWLEDGE_BASE = CommunityTemplate(
    id="knowledge_base",
    name="Public knowledge base",
    description=(
        "Read-only to start: publish the answers you already have, and open "
        "replies later once there's something worth replying to."
    ),
    audience="Teams with good internal docs and no public home for them",
    # The one template that ships closed. Publishing answers and inviting
    # replies are separate decisions, and this shape is for the first one.
    allow_participation=False,
    allow_new_topics=False,
    post_moderation="pre",
    channels=(
        TemplateChannel(
            name="Guides",
            slug="guides",
            description="How to do the things people ask us how to do.",
            topics=(
                SeedTopic(
                    name="About these guides",
                    first_message=(
                        "These are the answers we give most often, written down "
                        "once so they can be linked instead of retyped.\n\n"
                        "Replies are closed for now. If something here is wrong "
                        "or missing, tell us through support and we'll fix the "
                        "page."
                    ),
                ),
            ),
        ),
        TemplateChannel(
            name="Known issues",
            slug="known-issues",
            description="What's broken, what we know, and what to do meanwhile.",
            topics=(
                SeedTopic(
                    name="How we list known issues",
                    first_message=(
                        "One thread per issue: what you'll see, whether there's a "
                        "workaround, and where it stands. We update the thread "
                        "rather than opening a new one, so a link you shared last "
                        "month still tells the truth today."
                    ),
                ),
            ),
        ),
    ),
)


COMMUNITY_TEMPLATES: tuple[CommunityTemplate, ...] = (
    PRODUCT_SUPPORT,
    OPEN_SOURCE,
    SAAS_CUSTOMERS,
    KNOWLEDGE_BASE,
)

TEMPLATES_BY_ID: dict[str, CommunityTemplate] = {t.id: t for t in COMMUNITY_TEMPLATES}


def get_template(template_id: str) -> CommunityTemplate | None:
    return TEMPLATES_BY_ID.get(template_id)


def template_summaries() -> list[dict[str, Any]]:
    """Catalogue in the shape the picker renders, previews included."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "audience": t.audience,
            "allow_participation": t.allow_participation,
            "allow_new_topics": t.allow_new_topics,
            "post_moderation": t.post_moderation,
            "channels": [
                {
                    "name": ch.name,
                    "description": ch.description,
                    "topics": [topic.name for topic in ch.topics],
                }
                for ch in t.channels
            ],
        }
        for t in COMMUNITY_TEMPLATES
    ]
