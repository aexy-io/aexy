"""Writing style service for email personalization."""

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent import UserWritingStyle
from aexy.models.crm import CRMActivity
from aexy.core.config import settings


class WritingStyleService:
    """Service for analyzing and applying user writing styles."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_style(
        self,
        developer_id: str,
        workspace_id: str,
    ) -> UserWritingStyle | None:
        """Get a user's writing style profile."""
        stmt = select(UserWritingStyle).where(
            UserWritingStyle.developer_id == developer_id,
            UserWritingStyle.workspace_id == workspace_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_style(
        self,
        developer_id: str,
        workspace_id: str,
    ) -> UserWritingStyle:
        """Get or create a writing style profile."""
        style = await self.get_style(developer_id, workspace_id)
        if style:
            return style

        style = UserWritingStyle(
            id=str(uuid4()),
            developer_id=developer_id,
            workspace_id=workspace_id,
            style_profile={},
        )
        self.db.add(style)
        await self.db.flush()
        await self.db.refresh(style)
        return style

    async def analyze_emails(
        self,
        developer_id: str,
        workspace_id: str,
        max_samples: int = 50,
    ) -> UserWritingStyle:
        """Analyze user's sent emails to extract writing style."""
        # Get sent emails from activities
        stmt = (
            select(CRMActivity)
            .where(
                CRMActivity.workspace_id == workspace_id,
                CRMActivity.actor_id == developer_id,
                CRMActivity.activity_type == "email.sent",
            )
            .order_by(CRMActivity.occurred_at.desc())
            .limit(max_samples)
        )
        result = await self.db.execute(stmt)
        activities = result.scalars().all()

        if not activities:
            # Return empty profile if no emails found
            return await self.get_or_create_style(developer_id, workspace_id)

        # Extract email bodies
        email_bodies = []
        for activity in activities:
            metadata = activity.metadata or {}
            body = metadata.get("body", "") or activity.description or ""
            if body and len(body) > 50:  # Skip very short emails
                email_bodies.append(body)

        if not email_bodies:
            return await self.get_or_create_style(developer_id, workspace_id)

        # Analyze the emails
        style_profile = self._analyze_style(email_bodies)

        # Update or create style
        style = await self.get_or_create_style(developer_id, workspace_id)
        style.style_profile = style_profile
        style.samples_analyzed = len(email_bodies)
        style.is_trained = True
        style.last_trained_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(style)
        return style

    def _analyze_style(self, email_bodies: list[str]) -> dict:
        """Analyze email bodies to extract style characteristics."""
        all_text = "\n\n".join(email_bodies)
        sentences = self._extract_sentences(all_text)

        # Calculate metrics
        avg_sentence_length = self._calc_avg_sentence_length(sentences)
        formality = self._detect_formality(all_text)
        tone = self._detect_tone(all_text)
        greetings = self._extract_greetings(email_bodies)
        signoffs = self._extract_signoffs(email_bodies)
        common_phrases = self._extract_common_phrases(email_bodies)
        sample_excerpts = self._extract_sample_excerpts(email_bodies)

        return {
            "formality": formality,
            "tone": tone,
            "avg_sentence_length": avg_sentence_length,
            "common_greetings": greetings[:5],
            "common_signoffs": signoffs[:5],
            "common_phrases": common_phrases[:10],
            "sample_excerpts": sample_excerpts[:3],
        }

    def _extract_sentences(self, text: str) -> list[str]:
        """Extract sentences from text."""
        # Simple sentence splitting
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10]

    def _calc_avg_sentence_length(self, sentences: list[str]) -> int:
        """Calculate average sentence length in words."""
        if not sentences:
            return 15
        word_counts = [len(s.split()) for s in sentences]
        return int(sum(word_counts) / len(word_counts))

    def _detect_formality(self, text: str) -> str:
        """Detect formality level of writing."""
        text_lower = text.lower()

        # Formal indicators
        formal_words = [
            "regarding", "pursuant", "therefore", "consequently",
            "furthermore", "nevertheless", "accordingly", "hereby",
            "sincerely", "respectfully", "dear sir", "dear madam",
        ]

        # Casual indicators
        casual_words = [
            "hey", "hi there", "thanks!", "awesome", "cool",
            "gonna", "wanna", "kinda", "btw", "fyi", "asap",
            "!", "...", ":)", "lol", "haha",
        ]

        formal_count = sum(1 for word in formal_words if word in text_lower)
        casual_count = sum(1 for word in casual_words if word in text_lower)

        if formal_count > casual_count + 2:
            return "formal"
        elif casual_count > formal_count + 2:
            return "casual"
        return "neutral"

    def _detect_tone(self, text: str) -> str:
        """Detect the tone of writing."""
        text_lower = text.lower()

        # Friendly indicators
        friendly_words = [
            "hope", "excited", "happy", "great", "wonderful",
            "appreciate", "thank you", "thanks", "pleasure",
            "looking forward", "glad", "enjoy",
        ]

        # Direct indicators
        direct_words = [
            "need", "must", "require", "immediately", "urgent",
            "deadline", "asap", "critical", "essential",
        ]

        friendly_count = sum(1 for word in friendly_words if word in text_lower)
        direct_count = sum(1 for word in direct_words if word in text_lower)

        if friendly_count > direct_count + 3:
            return "friendly"
        elif direct_count > friendly_count + 2:
            return "direct"
        return "professional"

    def _extract_greetings(self, emails: list[str]) -> list[str]:
        """Extract common greeting patterns."""
        greetings = []
        greeting_patterns = [
            r'^(Hi\s+\w+)',
            r'^(Hello\s+\w+)',
            r'^(Hey\s+\w+)',
            r'^(Dear\s+\w+)',
            r'^(Good\s+(?:morning|afternoon|evening))',
            r'^(Hi,)',
            r'^(Hello,)',
            r'^(Hey,)',
        ]

        for email in emails:
            lines = email.strip().split('\n')
            if lines:
                first_line = lines[0].strip()
                for pattern in greeting_patterns:
                    match = re.match(pattern, first_line, re.IGNORECASE)
                    if match:
                        greeting = match.group(1)
                        # Normalize: replace specific names with {name}
                        greeting = re.sub(r'(Hi|Hello|Hey|Dear)\s+\w+', r'\1 {name}', greeting)
                        if greeting not in greetings:
                            greetings.append(greeting)
                        break

        # Default greetings if none found
        if not greetings:
            greetings = ["Hi {name},", "Hello,"]

        return greetings

    def _extract_signoffs(self, emails: list[str]) -> list[str]:
        """Extract common sign-off patterns."""
        signoffs = []
        signoff_patterns = [
            r'(Best(?:\s+regards)?),?\s*$',
            r'(Thanks),?\s*$',
            r'(Thank you),?\s*$',
            r'(Cheers),?\s*$',
            r'(Regards),?\s*$',
            r'(Sincerely),?\s*$',
            r'(Kind regards),?\s*$',
            r'(Warm regards),?\s*$',
            r'(Talk soon),?\s*$',
            r'(Looking forward),?\s*$',
        ]

        for email in emails:
            lines = email.strip().split('\n')
            # Check last few lines for signoffs
            for line in lines[-5:]:
                line = line.strip()
                for pattern in signoff_patterns:
                    match = re.search(pattern, line, re.IGNORECASE)
                    if match:
                        signoff = match.group(1) + ","
                        if signoff not in signoffs:
                            signoffs.append(signoff)
                        break

        # Default signoffs if none found
        if not signoffs:
            signoffs = ["Best,", "Thanks,"]

        return signoffs

    def _extract_common_phrases(self, emails: list[str]) -> list[str]:
        """Extract commonly used phrases."""
        phrases = {}

        common_patterns = [
            r"I wanted to [\w\s]+",
            r"Just wanted to [\w\s]+",
            r"I hope [\w\s]+",
            r"Looking forward to [\w\s]+",
            r"Let me know [\w\s]+",
            r"Feel free to [\w\s]+",
            r"I'd love to [\w\s]+",
            r"Happy to [\w\s]+",
            r"Please let me know [\w\s]+",
            r"I appreciate [\w\s]+",
        ]

        for email in emails:
            for pattern in common_patterns:
                matches = re.findall(pattern, email, re.IGNORECASE)
                for match in matches:
                    # Truncate long matches
                    phrase = match[:50].strip()
                    if len(phrase) > 10:
                        phrases[phrase] = phrases.get(phrase, 0) + 1

        # Sort by frequency and return top phrases
        sorted_phrases = sorted(phrases.items(), key=lambda x: x[1], reverse=True)
        return [p[0] for p in sorted_phrases[:10]]

    def _extract_sample_excerpts(self, emails: list[str]) -> list[str]:
        """Extract sample excerpts for few-shot prompting."""
        excerpts = []
        for email in emails[:5]:
            # Get middle portion of email (skip greeting and signoff)
            lines = email.strip().split('\n')
            if len(lines) > 4:
                middle = '\n'.join(lines[1:-2])
                if len(middle) > 100:
                    excerpt = middle[:300] + "..." if len(middle) > 300 else middle
                    excerpts.append(excerpt)

        return excerpts

    async def generate_email(
        self,
        developer_id: str,
        workspace_id: str,
        recipient_name: str,
        purpose: str,
        key_points: list[str] | None = None,
        tone_override: str | None = None,
    ) -> dict:
        """Generate an email matching the user's style using LLM."""
        from anthropic import AsyncAnthropic

        # Get style profile
        style = await self.get_style(developer_id, workspace_id)
        if not style or not style.is_trained:
            # Use default style
            style_profile = {
                "formality": "neutral",
                "tone": "professional",
                "common_greetings": ["Hi {name},"],
                "common_signoffs": ["Best,"],
                "common_phrases": [],
                "sample_excerpts": [],
            }
        else:
            style_profile = style.style_profile

        # Build the prompt
        prompt = self._build_generation_prompt(
            style_profile=style_profile,
            recipient_name=recipient_name,
            purpose=purpose,
            key_points=key_points or [],
            tone_override=tone_override,
        )

        # Call LLM
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )

        email_content = response.content[0].text

        # Parse subject and body
        subject, body = self._parse_email_response(email_content)

        return {
            "subject": subject,
            "body": body,
            "style_applied": style_profile.get("formality", "neutral"),
        }

    def _build_generation_prompt(
        self,
        style_profile: dict,
        recipient_name: str,
        purpose: str,
        key_points: list[str],
        tone_override: str | None,
    ) -> str:
        """Build the prompt for email generation."""
        formality = style_profile.get("formality", "neutral")
        tone = tone_override or style_profile.get("tone", "professional")
        greetings = style_profile.get("common_greetings", ["Hi {name},"])
        signoffs = style_profile.get("common_signoffs", ["Best,"])
        phrases = style_profile.get("common_phrases", [])
        excerpts = style_profile.get("sample_excerpts", [])

        greeting_example = greetings[0].replace("{name}", recipient_name) if greetings else f"Hi {recipient_name},"
        signoff_example = signoffs[0] if signoffs else "Best,"

        key_points_str = "\n".join(f"- {point}" for point in key_points) if key_points else "None specified"

        excerpt_examples = ""
        if excerpts:
            excerpt_examples = "\n\nExamples of the user's writing style:\n" + "\n---\n".join(excerpts[:2])

        return f"""Write an email for me with the following characteristics:

WRITING STYLE:
- Formality: {formality}
- Tone: {tone}
- Greeting style: Use something like "{greeting_example}"
- Sign-off style: Use something like "{signoff_example}"
- Common phrases to incorporate if natural: {', '.join(phrases[:5]) if phrases else 'none specified'}
{excerpt_examples}

EMAIL DETAILS:
- Recipient: {recipient_name}
- Purpose: {purpose}
- Key points to include:
{key_points_str}

INSTRUCTIONS:
1. Write the email as if you ARE the user, matching their style
2. Keep it concise (under 150 words for the body)
3. Sound natural and human, not robotic
4. Include a clear call-to-action if appropriate

Format your response as:
SUBJECT: [subject line]

BODY:
[email body]
"""

    def _parse_email_response(self, response: str) -> tuple[str, str]:
        """Parse LLM response into subject and body."""
        subject = ""
        body = response

        # Try to extract subject
        subject_match = re.search(r'SUBJECT:\s*(.+?)(?:\n|$)', response, re.IGNORECASE)
        if subject_match:
            subject = subject_match.group(1).strip()

        # Try to extract body
        body_match = re.search(r'BODY:\s*(.+)', response, re.IGNORECASE | re.DOTALL)
        if body_match:
            body = body_match.group(1).strip()

        return subject, body
