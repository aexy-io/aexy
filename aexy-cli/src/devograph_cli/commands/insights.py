"""Insights command - Predictive analytics and insights."""

import asyncio

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from aexy_cli.api import AexyClient

console = Console()


@click.group()
def insights():
    """Predictive analytics and insights."""
    pass


@insights.command("attrition")
@click.argument("username", required=False)
@click.option("--all", "-a", "show_all", is_flag=True, help="Show all developers")
def attrition_risk(username: str | None, show_all: bool):
    """View attrition risk analysis."""
    asyncio.run(_attrition_risk(username, show_all))


async def _attrition_risk(username: str | None, show_all: bool):
    """Async implementation of attrition risk."""
    client = AexyClient()

    if username:
        with console.status(f"[bold green]Fetching developer @{username}..."):
            developer = await client.get_developer_by_username(username)

        if not developer:
            console.print(f"[red]Developer @{username} not found[/red]")
            return

        with console.status("[bold green]Analyzing attrition risk..."):
            risk = await client.get_attrition_risk(developer["id"])

        if not risk:
            console.print("[yellow]No attrition analysis available[/yellow]")
            return

        _display_attrition_risk(developer, risk)
    elif show_all:
        with console.status("[bold green]Fetching all developers..."):
            developers = await client.list_developers()

        if not developers:
            console.print("[yellow]No developers found[/yellow]")
            return

        console.print(Panel("[bold]Attrition Risk Overview[/bold]", border_style="blue"))

        table = Table()
        table.add_column("Developer", style="cyan")
        table.add_column("Risk Level", style="white")
        table.add_column("Score", style="yellow")
        table.add_column("Top Factor", style="white")

        for dev in developers[:20]:
            with console.status(f"[dim]Analyzing @{dev.get('github_username')}...[/dim]"):
                risk = await client.get_attrition_risk(dev["id"])

            if risk:
                score = risk.get("risk_score", 0)
                level = risk.get("risk_level", "unknown")
                level_style = _get_risk_style(level)

                factors = risk.get("factors", [])
                top_factor = factors[0].get("factor", "-") if factors else "-"

                table.add_row(
                    f"@{dev.get('github_username', '')}",
                    f"[{level_style}]{level.upper()}[/{level_style}]",
                    f"{score:.0%}",
                    top_factor[:30],
                )

        console.print(table)
    else:
        console.print("[yellow]Please specify a username or use --all flag[/yellow]")


def _display_attrition_risk(developer: dict, risk: dict):
    """Display detailed attrition risk for a developer."""
    username = developer.get("github_username", "")
    score = risk.get("risk_score", 0)
    level = risk.get("risk_level", "unknown")
    confidence = risk.get("confidence", 0)

    level_style = _get_risk_style(level)

    console.print(Panel(
        f"[bold]Attrition Risk Analysis[/bold]\n"
        f"Developer: @{username}\n"
        f"Risk Level: [{level_style}]{level.upper()}[/{level_style}]\n"
        f"Risk Score: {score:.0%}\n"
        f"Confidence: {confidence:.0%}",
        border_style="blue",
    ))

    # Factors
    factors = risk.get("factors", [])
    if factors:
        console.print()
        table = Table(title="Risk Factors")
        table.add_column("Factor", style="cyan")
        table.add_column("Weight", style="yellow")
        table.add_column("Evidence", style="white")
        table.add_column("Trend", style="magenta")

        for f in factors:
            weight = f.get("weight", 0)
            weight_bar = "█" * int(weight * 10)
            table.add_row(
                f.get("factor", ""),
                f"{weight_bar} {weight:.0%}",
                f.get("evidence", "")[:40],
                f.get("trend", "stable"),
            )

        console.print(table)

    # Recommendations
    recommendations = risk.get("recommendations", [])
    if recommendations:
        console.print()
        console.print("[bold]Recommendations:[/bold]")
        for rec in recommendations:
            console.print(f"  • {rec}")


def _get_risk_style(level: str) -> str:
    """Get rich style for risk level."""
    return {
        "critical": "red bold",
        "high": "red",
        "moderate": "yellow",
        "low": "green",
    }.get(level.lower(), "white")


@insights.command("burnout")
@click.argument("username")
def burnout_risk(username: str):
    """View burnout risk analysis for a developer."""
    asyncio.run(_burnout_risk(username))


async def _burnout_risk(username: str):
    """Async implementation of burnout risk."""
    client = AexyClient()

    with console.status(f"[bold green]Fetching developer @{username}..."):
        developer = await client.get_developer_by_username(username)

    if not developer:
        console.print(f"[red]Developer @{username} not found[/red]")
        return

    with console.status("[bold green]Analyzing burnout risk..."):
        risk = await client.get_burnout_risk(developer["id"])

    if not risk:
        console.print("[yellow]No burnout analysis available[/yellow]")
        return

    score = risk.get("risk_score", 0)
    level = risk.get("risk_level", "unknown")
    level_style = _get_risk_style(level)

    console.print(Panel(
        f"[bold]Burnout Risk Analysis[/bold]\n"
        f"Developer: @{username}\n"
        f"Risk Level: [{level_style}]{level.upper()}[/{level_style}]\n"
        f"Risk Score: {score:.0%}",
        border_style="blue",
    ))

    # Indicators
    indicators = risk.get("indicators", [])
    if indicators:
        console.print()
        console.print("[bold]Warning Indicators:[/bold]")
        for ind in indicators:
            console.print(f"  • {ind}")

    # Recommendations
    recommendations = risk.get("recommendations", [])
    if recommendations:
        console.print()
        console.print("[bold]Recommendations:[/bold]")
        for rec in recommendations:
            console.print(f"  • {rec}")


@insights.command("trajectory")
@click.argument("username")
@click.option("--months", "-m", default=6, help="Months to predict ahead")
def trajectory(username: str, months: int):
    """View performance trajectory prediction."""
    asyncio.run(_trajectory(username, months))


async def _trajectory(username: str, months: int):
    """Async implementation of trajectory."""
    client = AexyClient()

    with console.status(f"[bold green]Fetching developer @{username}..."):
        developer = await client.get_developer_by_username(username)

    if not developer:
        console.print(f"[red]Developer @{username} not found[/red]")
        return

    with console.status(f"[bold green]Predicting {months}-month trajectory..."):
        traj = await client.get_performance_trajectory(developer["id"])

    if not traj:
        console.print("[yellow]No trajectory analysis available[/yellow]")
        return

    direction = traj.get("trajectory", "steady")
    confidence = traj.get("confidence", 0)

    direction_style = {
        "accelerating": "green bold",
        "steady": "blue",
        "plateauing": "yellow",
        "declining": "red",
    }.get(direction, "white")

    console.print(Panel(
        f"[bold]Performance Trajectory[/bold]\n"
        f"Developer: @{username}\n"
        f"Direction: [{direction_style}]{direction.upper()}[/{direction_style}]\n"
        f"Confidence: {confidence:.0%}",
        border_style="blue",
    ))

    # Predicted growth
    growth = traj.get("predicted_growth", [])
    if growth:
        console.print()
        table = Table(title="Predicted Skill Growth")
        table.add_column("Skill", style="cyan")
        table.add_column("Current", style="yellow")
        table.add_column("Predicted", style="green")
        table.add_column("Timeline", style="white")

        for g in growth:
            table.add_row(
                g.get("skill", ""),
                f"{g.get('current', 0)}",
                f"{g.get('predicted', 0)}",
                g.get("timeline", ""),
            )

        console.print(table)

    # Career readiness
    career = traj.get("career_readiness", {})
    if career:
        console.print()
        next_level = career.get("next_level", "Unknown")
        readiness = career.get("readiness_score", 0)
        blockers = career.get("blockers", [])

        console.print(f"[bold]Career Readiness for {next_level}:[/bold] {readiness:.0%}")
        if blockers:
            console.print("[dim]Blockers:[/dim]")
            for b in blockers:
                console.print(f"  • {b}")


@insights.command("team-health")
@click.argument("team_name", required=False)
def team_health(team_name: str | None):
    """View team health analysis."""
    asyncio.run(_team_health(team_name))


async def _team_health(team_name: str | None):
    """Async implementation of team health."""
    client = AexyClient()

    if team_name:
        with console.status(f"[bold green]Fetching team {team_name}..."):
            teams = await client.list_teams()
            team_data = next((t for t in teams if t.get("name") == team_name), None)

        if not team_data:
            console.print(f"[red]Team '{team_name}' not found[/red]")
            return

        developer_ids = team_data.get("developer_ids", [])
        title = f"Team: {team_name}"
    else:
        with console.status("[bold green]Fetching all developers..."):
            developers = await client.list_developers()

        if not developers:
            console.print("[yellow]No developers found[/yellow]")
            return

        developer_ids = [d["id"] for d in developers]
        title = "Organization"

    with console.status("[bold green]Analyzing team health..."):
        health = await client.get_team_health(developer_ids)

    if not health:
        console.print("[yellow]No team health analysis available[/yellow]")
        return

    score = health.get("health_score", 0)
    grade = health.get("health_grade", "?")

    grade_style = {
        "A": "green bold",
        "B": "green",
        "C": "yellow",
        "D": "red",
        "F": "red bold",
    }.get(grade, "white")

    console.print(Panel(
        f"[bold]{title} Health Report[/bold]\n\n"
        f"Health Score: {score:.0%}\n"
        f"Grade: [{grade_style}]{grade}[/{grade_style}]",
        border_style="blue",
    ))

    # Strengths
    strengths = health.get("strengths", [])
    if strengths:
        console.print()
        console.print("[bold green]Strengths:[/bold green]")
        for s in strengths:
            console.print(f"  ✓ {s}")

    # Risks
    risks = health.get("risks", [])
    if risks:
        console.print()
        table = Table(title="[red]Risks[/red]")
        table.add_column("Risk", style="cyan")
        table.add_column("Severity", style="red")
        table.add_column("Mitigation", style="yellow")

        for r in risks:
            severity = r.get("severity", "medium")
            table.add_row(
                r.get("risk", ""),
                severity.upper(),
                r.get("mitigation", "")[:40],
            )

        console.print(table)

    # Recommendations
    recommendations = health.get("recommendations", [])
    if recommendations:
        console.print()
        console.print("[bold]Recommendations:[/bold]")
        for rec in recommendations:
            console.print(f"  • {rec}")
