"""Outreach Sequence Workflow — orchestrates per-enrollment step execution.

Each enrolled contact gets its own workflow instance that walks through the
sequence steps with configurable delays, pause/resume support, and early exit
on reply, bounce, unsubscribe, or manual unenroll.

Features:
    - Send-window enforcement: steps only execute during allowed hours in
      the recipient's (or sequence default) timezone.
    - A/B variant selection: steps with ``variants`` in their config get a
      randomly chosen variant at execution time.
    - Reply threading: ``thread_id`` from prior executions is forwarded to
      subsequent steps so emails are threaded in the recipient's inbox.

Signals:
    exit_sequence  — immediately exit the sequence
    pause          — pause execution (holds between steps)
    resume         — resume after pause
    reply_received — contact replied, exit with "replied" reason
"""

import asyncio
import hashlib
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from aexy.temporal.activities.gtm import (
        OutreachEnrollmentInput,
        ExecuteStepInput,
        FinalizeEnrollmentInput,
    )


def _seconds_until_send_window(
    settings: dict,
    recipient_tz: str | None,
) -> int:
    """Return seconds to wait until the next send window opens, or 0 if inside.

    Uses ``workflow.now()`` for the current time (Temporal-deterministic).
    Falls back to UTC if timezone is unknown.
    """
    sw = settings.get("send_window") or settings
    start_hour = sw.get("start_hour", sw.get("send_window_start_hour", 0))
    end_hour = sw.get("end_hour", sw.get("send_window_end_hour", 24))

    if start_hour == 0 and end_hour == 24:
        return 0  # No send window configured — always open

    tz_name = recipient_tz or sw.get("timezone", "UTC")

    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
    except Exception:
        return 0  # Unknown timezone — don't block

    now_utc = workflow.now()
    now_local = now_utc.astimezone(tz)

    # Check day-of-week (0=Mon, 6=Sun) — skip weekends by default
    weekday = now_local.weekday()
    days_to_add = 0
    if weekday == 5:  # Saturday
        days_to_add = 2
    elif weekday == 6:  # Sunday
        days_to_add = 1

    hour = now_local.hour
    minute = now_local.minute

    if days_to_add == 0 and start_hour <= hour < end_hour:
        return 0  # Inside the window right now

    # Calculate seconds to next window open
    if days_to_add == 0 and hour < start_hour:
        # Today, before window opens
        delta = (start_hour - hour) * 3600 - minute * 60
    else:
        # Tomorrow (or Monday if weekend)
        if days_to_add == 0:
            days_to_add = 1
        delta = days_to_add * 86400 + (start_hour - hour) * 3600 - minute * 60

    return max(delta, 60)  # At least 60s to avoid tight loops


def _select_variant(step: dict, enrollment_id: str = "") -> tuple[dict, int | None]:
    """If step has A/B variants, select one deterministically. Returns (config, variant_index).

    Uses a hash of the enrollment_id + step index to produce a deterministic,
    replay-safe selection instead of ``random.random()`` which is
    non-deterministic across Temporal workflow replays.

    Step config format for A/B:
        config.variants: [{subject, body, weight}, ...]

    If no variants, returns original config unchanged.
    """
    config = step.get("config") or {}
    variants = config.get("variants")
    if not variants or len(variants) < 2:
        return config, None

    weights = [v.get("weight", 1) for v in variants]
    total = sum(weights)
    if total <= 0:
        return config, None

    # Deterministic hash-based selection (replay-safe)
    step_index = step.get("step_index", 0)
    hash_input = f"{enrollment_id}:{step_index}".encode()
    hash_value = int(hashlib.sha256(hash_input).hexdigest(), 16)
    r = (hash_value % 10000) / 10000.0 * total
    cumulative = 0
    for idx, (v, w) in enumerate(zip(variants, weights)):
        cumulative += w
        if r <= cumulative:
            # Merge variant fields into config
            merged = {**config, **{k: v2 for k, v2 in v.items() if k != "weight"}}
            merged.pop("variants", None)
            return merged, idx

    # Fallback to last variant
    merged = {**config, **{k: v2 for k, v2 in variants[-1].items() if k != "weight"}}
    merged.pop("variants", None)
    return merged, len(variants) - 1


@workflow.defn(name="OutreachSequenceWorkflow", sandboxed=False)
class OutreachSequenceWorkflow:
    """Walk a contact through a multi-channel outreach sequence."""

    def __init__(self):
        self.should_exit = False
        self.is_paused = False
        self._exit_reason = "completed"

    # -----------------------------------------------------------------
    # Signals
    # -----------------------------------------------------------------

    @workflow.signal
    async def exit_sequence(self):
        """Signal to immediately exit the sequence."""
        self.should_exit = True
        self._exit_reason = "exited"

    @workflow.signal
    async def pause(self):
        """Signal to pause execution between steps."""
        self.is_paused = True

    @workflow.signal
    async def resume(self):
        """Signal to resume execution after a pause."""
        self.is_paused = False

    @workflow.signal
    async def reply_received(self):
        """Signal that the contact replied — exit with replied reason."""
        self.should_exit = True
        self._exit_reason = "replied"

    # -----------------------------------------------------------------
    # Main run
    # -----------------------------------------------------------------

    @workflow.run
    async def run(self, input: OutreachEnrollmentInput) -> dict:
        steps = input.steps
        settings = getattr(input, "settings", None) or {}
        recipient_tz = getattr(input, "recipient_timezone", None)
        executed = 0
        last_thread_id: str | None = None

        for step in steps:
            # Check exit before each step
            if self.should_exit:
                break

            # ---- Handle delay between steps ----
            delay_seconds = step.get("delay_days", 0) * 86400 + step.get("delay_hours", 0) * 3600
            if delay_seconds > 0:
                try:
                    await workflow.wait_condition(
                        lambda: self.should_exit,
                        timeout=timedelta(seconds=delay_seconds),
                    )
                except asyncio.TimeoutError:
                    pass  # Timer expired naturally, continue to step execution
                if self.should_exit:
                    break

            # ---- Handle pause ----
            while self.is_paused and not self.should_exit:
                try:
                    await workflow.wait_condition(
                        lambda: not self.is_paused or self.should_exit,
                        timeout=timedelta(hours=24),
                    )
                except asyncio.TimeoutError:
                    pass  # Re-check conditions after 24h
            if self.should_exit:
                break

            # ---- Skip wait-only steps (delays already handled above) ----
            if step.get("channel") == "wait":
                executed += 1
                continue

            # ---- Send-window enforcement ----
            wait_secs = _seconds_until_send_window(settings, recipient_tz)
            if wait_secs > 0:
                try:
                    await workflow.wait_condition(
                        lambda: self.should_exit,
                        timeout=timedelta(seconds=wait_secs),
                    )
                except asyncio.TimeoutError:
                    pass
                if self.should_exit:
                    break

            # ---- A/B variant selection ----
            step_config, variant_index = _select_variant(step, enrollment_id=input.enrollment_id)

            # ---- Build execution input ----
            exec_config = dict(step_config)
            if last_thread_id:
                exec_config["thread_id"] = last_thread_id
            if variant_index is not None:
                exec_config["variant_index"] = variant_index

            # ---- Execute the step ----
            result = await workflow.execute_activity(
                "execute_outreach_step",
                ExecuteStepInput(
                    enrollment_id=input.enrollment_id,
                    workspace_id=input.workspace_id,
                    step_index=step.get("step_index", executed),
                    channel=step.get("channel", "email"),
                    action=step.get("action", "send_email"),
                    config=exec_config,
                ),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=30),
                ),
            )

            # Track thread_id from the execution result for reply threading
            if isinstance(result, dict):
                last_thread_id = result.get("thread_id") or result.get("provider_message_id") or last_thread_id

            executed += 1

        # ---- Finalize enrollment ----
        exit_reason = self._exit_reason if self.should_exit else "completed"
        await workflow.execute_activity(
            "finalize_enrollment",
            FinalizeEnrollmentInput(
                enrollment_id=input.enrollment_id,
                exit_reason=exit_reason,
            ),
            start_to_close_timeout=timedelta(minutes=2),
        )

        return {
            "enrollment_id": input.enrollment_id,
            "steps_executed": executed,
            "exit_reason": exit_reason,
        }
