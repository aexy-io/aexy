"""Profile command - View developer profiles."""

import asyncio

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from aexy_cli.api import AexyClient

console = Console()


@click.group()
def profile():
    """View and manage developer profiles."""
    pass


@profile.command("show")
@click.argument("username")
@click.option("--full", "-f", is_flag=True, help="Show full profile with analysis")
def show_profile(username: str, full: bool):
    """Show developer profile by GitHub username."""
    asyncio.run(_show_profile(username, full))


async def _show_profile(username: str, full: bool):
    """Async implementation of show profile."""
    client = AexyClient()

    with console.status(f"[bold green]Fetching profile for @{username}..."):
        developer = await client.get_developer_by_username(username)

    if not developer:
        console.print(f"[red]Developer @{username} not found[/red]")
        return

    # Basic info panel
    name = developer.get("name") or username
    seniority = developer.get("seniority_level", "Unknown")
    skills = developer.get("skills", [])

    info_table = Table(show_header=False, box=None)
    info_table.add_column("Field", style="bold cyan")
    info_table.add_column("Value")

    info_table.add_row("Name", name)
    info_table.add_row("GitHub", f"@{username}")
    info_table.add_row("Seniority", seniority)
    info_table.add_row("Skills", ", ".join(skills[:10]) if skills else "No skills recorded")

    if developer.get("email"):
        info_table.add_row("Email", developer["email"])
    if developer.get("location"):
        info_table.add_row("Location", developer["location"])

    console.print(Panel(info_table, title=f"[bold]{name}[/bold]", border_style="blue"))

    if full and developer.get("id"):
        # Fetch full profile with analysis
        with console.status("[bold green]Fetching detailed analysis..."):
            profile_data = await client.get_developer_profile(developer["id"])

        if profile_data:
            _display_full_profile(profile_data)


def _display_full_profile(profile_data: dict):
    """Display full profile analysis."""
    # Skill analysis
    skill_analysis = profile_data.get("skill_analysis", {})
    if skill_analysis:
        console.print()
        skills_table = Table(title="Skill Analysis", show_header=True)
        skills_table.add_column("Skill", style="cyan")
        skills_table.add_column("Level", style="green")
        skills_table.add_column("Trend", style="yellow")

        for skill in skill_analysis.get("skills", [])[:10]:
            skills_table.add_row(
                skill.get("name", ""),
                str(skill.get("level", "")),
                skill.get("trend", "stable"),
            )

        console.print(skills_table)

    # Activity summary
    activity = profile_data.get("activity_summary", {})
    if activity:
        console.print()
        activity_table = Table(title="Recent Activity (30 days)", show_header=True)
        activity_table.add_column("Metric", style="cyan")
        activity_table.add_column("Value", style="green")

        activity_table.add_row("Commits", str(activity.get("commits", 0)))
        activity_table.add_row("Pull Requests", str(activity.get("pull_requests", 0)))
        activity_table.add_row("Reviews", str(activity.get("reviews", 0)))
        activity_table.add_row("Issues", str(activity.get("issues", 0)))

        console.print(activity_table)


@profile.command("list")
@click.option("--limit", "-n", default=20, help="Number of developers to show")
def list_profiles(limit: int):
    """List all developers."""
    asyncio.run(_list_profiles(limit))


async def _list_profiles(limit: int):
    """Async implementation of list profiles."""
    client = AexyClient()

    with console.status("[bold green]Fetching developers..."):
        developers = await client.list_developers()

    if not developers:
        console.print("[yellow]No developers found[/yellow]")
        return

    table = Table(title=f"Developers ({len(developers)} total)")
    table.add_column("Username", style="cyan")
    table.add_column("Name", style="white")
    table.add_column("Seniority", style="green")
    table.add_column("Top Skills", style="yellow")

    for dev in developers[:limit]:
        skills = dev.get("skills", [])[:3]
        table.add_row(
            f"@{dev.get('github_username', '')}",
            dev.get("name") or "-",
            dev.get("seniority_level") or "Unknown",
            ", ".join(skills) if skills else "-",
        )

    console.print(table)


@profile.command("export")
@click.argument("username")
@click.option("--format", "-f", type=click.Choice(["json", "pdf", "csv"]), default="json")
@click.option("--output", "-o", help="Output file path")
def export_profile(username: str, format: str, output: str | None):
    """Export developer profile."""
    asyncio.run(_export_profile(username, format, output))


async def _export_profile(username: str, format: str, output: str | None):
    """Async implementation of export profile."""
    client = AexyClient()

    with console.status(f"[bold green]Fetching profile for @{username}..."):
        developer = await client.get_developer_by_username(username)

    if not developer:
        console.print(f"[red]Developer @{username} not found[/red]")
        return

    with console.status(f"[bold green]Creating {format.upper()} export..."):
        job = await client.create_export(
            export_type="developer_profile",
            format=format,
            config={"developer_id": developer["id"]},
        )

    if job:
        console.print(f"[green]Export job created: {job.get('id')}[/green]")
        console.print(f"Status: {job.get('status')}")
    else:
        console.print("[red]Failed to create export job[/red]")
