"""Outreach Sequence Workflow — orchestrates per-enrollment step execution.

Each enrolled contact gets its own workflow instance that walks through the
sequence steps with configurable delays, pause/resume support, and early exit
on reply, bounce, unsubscribe, or manual unenroll.

Signals:
    exit_sequence  — immediately exit the sequence
    pause          — pause execution (holds between steps)
    resume         — resume after pause
    reply_received — contact replied, exit with "replied" reason
"""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from aexy.temporal.activities.gtm import (
        OutreachEnrollmentInput,
        ExecuteStepInput,
        FinalizeEnrollmentInput,
    )


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
        executed = 0

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

            # ---- Execute the step ----
            await workflow.execute_activity(
                "execute_outreach_step",
                ExecuteStepInput(
                    enrollment_id=input.enrollment_id,
                    workspace_id=input.workspace_id,
                    step_index=step.get("step_index", executed),
                    channel=step.get("channel", "email"),
                    action=step.get("action", "send_email"),
                    config=step.get("config", {}),
                ),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=30),
                ),
            )
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
