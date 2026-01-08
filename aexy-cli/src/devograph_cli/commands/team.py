"""Team command - Team analytics and management."""

import asyncio

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from aexy_cli.api import AexyClient

console = Console()


@click.group()
def team():
    """Team analytics and management."""
    pass


@team.command("list")
def list_teams():
    """List all teams."""
    asyncio.run(_list_teams())


async def _list_teams():
    """Async implementation of list teams."""
    client = AexyClient()

    with console.status("[bold green]Fetching teams..."):
        teams = await client.list_teams()

    if not teams:
        console.print("[yellow]No teams found[/yellow]")
        return

    table = Table(title=f"Teams ({len(teams)} total)")
    table.add_column("Name", style="cyan")
    table.add_column("Members", style="green")
    table.add_column("Description", style="white")

    for t in teams:
        member_count = len(t.get("developer_ids", []))
        table.add_row(
            t.get("name", "Unknown"),
            str(member_count),
            t.get("description") or "-",
        )

    console.print(table)


@team.command("skills")
@click.argument("team_name", required=False)
def team_skills(team_name: str | None):
    """Show team skill distribution."""
    asyncio.run(_team_skills(team_name))


async def _team_skills(team_name: str | None):
    """Async implementation of team skills."""
    client = AexyClient()

    # If no team specified, show aggregate for all developers
    if not team_name:
        with console.status("[bold green]Fetching all developers..."):
            developers = await client.list_developers()

        if not developers:
            console.print("[yellow]No developers found[/yellow]")
            return

        developer_ids = [d["id"] for d in developers]
        title = "All Developers"
    else:
        with console.status(f"[bold green]Fetching team {team_name}..."):
            teams = await client.list_teams()
            team_data = next((t for t in teams if t.get("name") == team_name), None)

        if not team_data:
            console.print(f"[red]Team '{team_name}' not found[/red]")
            return

        developer_ids = team_data.get("developer_ids", [])
        title = f"Team: {team_name}"

    with console.status("[bold green]Analyzing skills..."):
        heatmap = await client.get_skill_heatmap(developer_ids)

    if not heatmap:
        console.print("[yellow]No skill data available[/yellow]")
        return

    # Display skill summary
    console.print(Panel(f"[bold]{title}[/bold] - {len(developer_ids)} developers", border_style="blue"))

    skills = heatmap.get("skills", [])
    if skills:
        table = Table(title="Skill Distribution")
        table.add_column("Skill", style="cyan")
        table.add_column("Avg Level", style="green")
        table.add_column("Coverage", style="yellow")
        table.add_column("Experts", style="magenta")

        for skill in skills[:15]:
            avg_level = skill.get("average_level", 0)
            coverage = skill.get("coverage_percent", 0)
            experts = skill.get("expert_count", 0)

            # Create level bar
            level_bar = "█" * int(avg_level / 10) + "░" * (10 - int(avg_level / 10))

            table.add_row(
                skill.get("name", "Unknown"),
                f"{level_bar} {avg_level:.0f}%",
                f"{coverage:.0f}%",
                str(experts),
            )

        console.print(table)


@team.command("gaps")
@click.argument("team_name", required=False)
@click.option("--target-skills", "-s", multiple=True, help="Target skills to check gaps for")
def team_gaps(team_name: str | None, target_skills: tuple):
    """Identify skill gaps in team."""
    asyncio.run(_team_gaps(team_name, list(target_skills)))


async def _team_gaps(team_name: str | None, target_skills: list[str]):
    """Async implementation of team gaps."""
    client = AexyClient()

    if team_name:
        with console.status(f"[bold green]Fetching team {team_name}..."):
            teams = await client.list_teams()
            team_data = next((t for t in teams if t.get("name") == team_name), None)

        if not team_data:
            console.print(f"[red]Team '{team_name}' not found[/red]")
            return

        team_id = team_data.get("id")
        with console.status("[bold green]Analyzing skill gaps..."):
            gaps = await client.get_team_gaps(team_id)
    else:
        # Aggregate analysis for all developers
        with console.status("[bold green]Fetching developers..."):
            developers = await client.list_developers()

        if not developers:
            console.print("[yellow]No developers found[/yellow]")
            return

        # Calculate gaps manually
        skill_counts: dict[str, int] = {}
        for dev in developers:
            for skill in dev.get("skills", []):
                skill_counts[skill] = skill_counts.get(skill, 0) + 1

        # Find skills with low coverage
        total_devs = len(developers)
        gaps = {
            "critical_gaps": [
                {"skill": s, "coverage": c / total_devs * 100}
                for s, c in skill_counts.items()
                if c / total_devs < 0.2
            ][:10],
            "bus_factor_risks": [
                {"skill": s, "developers": c}
                for s, c in skill_counts.items()
                if c == 1
            ][:5],
        }

    if not gaps:
        console.print("[green]No significant skill gaps identified[/green]")
        return

    # Critical gaps
    critical = gaps.get("critical_gaps", [])
    if critical:
        console.print()
        table = Table(title="[red]Critical Skill Gaps[/red]", show_header=True)
        table.add_column("Skill", style="cyan")
        table.add_column("Coverage", style="red")
        table.add_column("Recommendation", style="yellow")

        for gap in critical[:10]:
            coverage = gap.get("coverage", 0)
            rec = "Hire or train urgently" if coverage < 10 else "Consider training"
            table.add_row(
                gap.get("skill", "Unknown"),
                f"{coverage:.0f}%",
                rec,
            )

        console.print(table)

    # Bus factor risks
    bus_risks = gaps.get("bus_factor_risks", [])
    if bus_risks:
        console.print()
        table = Table(title="[yellow]Bus Factor Risks[/yellow]", show_header=True)
        table.add_column("Skill", style="cyan")
        table.add_column("# Developers", style="red")
        table.add_column("Risk Level", style="yellow")

        for risk in bus_risks[:10]:
            devs = risk.get("developers", 1)
            risk_level = "Critical" if devs == 1 else "High" if devs <= 2 else "Medium"
            table.add_row(
                risk.get("skill", "Unknown"),
                str(devs),
                risk_level,
            )

        console.print(table)


@team.command("workload")
@click.argument("team_name", required=False)
def team_workload(team_name: str | None):
    """Show workload distribution."""
    asyncio.run(_team_workload(team_name))


async def _team_workload(team_name: str | None):
    """Async implementation of team workload."""
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
        title = "All Developers"

    with console.status("[bold green]Analyzing workload..."):
        workload = await client.get_workload_distribution(developer_ids)

    if not workload:
        console.print("[yellow]No workload data available[/yellow]")
        return

    console.print(Panel(f"[bold]{title}[/bold]", border_style="blue"))

    # Overall metrics
    imbalance = workload.get("imbalance_score", 0)
    status = "[green]Balanced" if imbalance < 0.3 else "[yellow]Slightly Imbalanced" if imbalance < 0.6 else "[red]Imbalanced"
    console.print(f"Workload Balance: {status}[/] (imbalance score: {imbalance:.2f})")
    console.print()

    # Individual workloads
    distributions = workload.get("distributions", [])
    if distributions:
        table = Table(title="Developer Workloads")
        table.add_column("Developer", style="cyan")
        table.add_column("Commits", style="green")
        table.add_column("PRs", style="yellow")
        table.add_column("Reviews", style="magenta")
        table.add_column("% of Total", style="white")

        for dist in distributions:
            pct = dist.get("percentage", 0)
            pct_bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
            table.add_row(
                dist.get("developer_name", "Unknown"),
                str(dist.get("commits", 0)),
                str(dist.get("pull_requests", 0)),
                str(dist.get("reviews", 0)),
                f"{pct_bar} {pct:.1f}%",
            )

        console.print(table)
