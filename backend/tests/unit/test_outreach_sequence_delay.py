from aexy.temporal.workflows.outreach_sequence import _delay_seconds


def test_sequence_delay_includes_days_hours_and_minutes():
    assert _delay_seconds({"delay_days": 1, "delay_hours": 2, "delay_minutes": 3}) == 93780


def test_sequence_delay_keeps_old_saved_steps_compatible():
    assert _delay_seconds({"delay_days": 0, "delay_hours": 1}) == 3600
