"""CLI commands for Gitraki."""

from gitraki_cli.commands.profile import profile
from gitraki_cli.commands.team import team
from gitraki_cli.commands.match import match
from gitraki_cli.commands.insights import insights
from gitraki_cli.commands.report import report

__all__ = ["profile", "team", "match", "insights", "report"]
