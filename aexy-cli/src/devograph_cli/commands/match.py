"""Match command - Task matching to developers."""

import asyncio

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from aexy_cli.api import AexyClient

console = Console()


@click.command()
@click.argument("description")
@click.option("--skills", "-s", multiple=True, help="Required skills")
@click.option("--top", "-n", default=5, help="Number of matches to show")
def match(description: str, skills: tuple, top: int):
    """Find best developers for a task.

    Example: aexy match "Fix authentication bug in OAuth flow" -s python -s oauth
    """
    asyncio.run(_match(description, list(skills), top))


async def _match(description: str, skills: list[str], top: int):
    """Async implementation of match."""
    client = AexyClient()

    console.print(Panel(f"[bold]Task:[/bold] {description}", border_style="blue"))
    if skills:
        console.print(f"[cyan]Required skills:[/cyan] {', '.join(skills)}")
    console.print()

    with console.status("[bold green]Finding best matches..."):
        result = await client.match_task(description, skills if skills else None)

    if not result:
        console.print("[yellow]No matches found[/yellow]")
        return

    matches = result.get("matches", [])
    if not matches:
        console.print("[yellow]No developers matched the criteria[/yellow]")
        return

    # Display matches
    table = Table(title=f"Top {min(top, len(matches))} Matches")
    table.add_column("#", style="dim")
    table.add_column("Developer", style="cyan")
    table.add_column("Score", style="green")
    table.add_column("Matching Skills", style="yellow")
    table.add_column("Reasoning", style="white")

    for i, m in enumerate(matches[:top], 1):
        score = m.get("score", 0)
        score_bar = "█" * int(score * 10) + "░" * (10 - int(score * 10))

        matching_skills = m.get("matching_skills", [])
        skills_str = ", ".join(matching_skills[:5])
        if len(matching_skills) > 5:
            skills_str += f" (+{len(matching_skills) - 5})"

        reasoning = m.get("reasoning", "")
        if len(reasoning) > 50:
            reasoning = reasoning[:47] + "..."

        table.add_row(
            str(i),
            f"@{m.get('github_username', 'unknown')}",
            f"{score_bar} {score:.0%}",
            skills_str,
            reasoning,
        )

    console.print(table)

    # Show analysis summary if available
    analysis = result.get("analysis")
    if analysis:
        console.print()
        console.print(Panel(
            f"[bold]Analysis Summary[/bold]\n\n{analysis}",
            border_style="green",
        ))

    # Recommendations
    recommendations = result.get("recommendations", [])
    if recommendations:
        console.print()
        console.print("[bold]Recommendations:[/bold]")
        for rec in recommendations[:3]:
            console.print(f"  • {rec}")
