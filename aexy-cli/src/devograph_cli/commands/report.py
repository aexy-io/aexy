"""Report command - Generate and export reports."""

import asyncio
import time

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from aexy_cli.api import AexyClient

console = Console()


@click.group()
def report():
    """Generate and export reports."""
    pass


@report.command("list")
def list_reports():
    """List all available reports."""
    asyncio.run(_list_reports())


async def _list_reports():
    """Async implementation of list reports."""
    client = AexyClient()

    with console.status("[bold green]Fetching reports..."):
        reports = await client.list_reports()

    if not reports:
        console.print("[yellow]No reports found[/yellow]")
        return

    table = Table(title=f"Reports ({len(reports)} total)")
    table.add_column("Name", style="cyan")
    table.add_column("Type", style="green")
    table.add_column("Created", style="yellow")
    table.add_column("Scheduled", style="magenta")

    for r in reports:
        scheduled = "Yes" if r.get("has_schedule") else "No"
        created = r.get("created_at", "")[:10] if r.get("created_at") else "-"

        table.add_row(
            r.get("name", "Unnamed"),
            r.get("report_type", "custom"),
            created,
            scheduled,
        )

    console.print(table)


@report.command("generate")
@click.argument("report_type", type=click.Choice(["weekly", "monthly", "team", "developer"]))
@click.option("--format", "-f", type=click.Choice(["pdf", "csv", "json", "xlsx"]), default="pdf")
@click.option("--output", "-o", help="Output file path")
@click.option("--wait/--no-wait", default=True, help="Wait for export to complete")
def generate_report(report_type: str, format: str, output: str | None, wait: bool):
    """Generate a report.

    Report types:
    - weekly: Weekly team summary
    - monthly: Monthly performance report
    - team: Team skills and health overview
    - developer: Individual developer profile report
    """
    asyncio.run(_generate_report(report_type, format, output, wait))


async def _generate_report(report_type: str, format: str, output: str | None, wait: bool):
    """Async implementation of generate report."""
    client = AexyClient()

    console.print(Panel(
        f"[bold]Generating {report_type.title()} Report[/bold]\n"
        f"Format: {format.upper()}",
        border_style="blue",
    ))

    with console.status("[bold green]Creating export job..."):
        job = await client.create_export(
            export_type=f"report_{report_type}",
            format=format,
            config={},
        )

    if not job:
        console.print("[red]Failed to create export job[/red]")
        return

    job_id = job.get("id")
    console.print(f"[green]Export job created:[/green] {job_id}")

    if wait:
        await _wait_for_export(client, job_id, output)
    else:
        console.print(f"[dim]Use 'aexy report status {job_id}' to check progress[/dim]")


async def _wait_for_export(client: AexyClient, job_id: str, output: str | None):
    """Wait for export job to complete."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Processing export...", total=None)

        max_attempts = 60  # 5 minutes max
        attempts = 0

        while attempts < max_attempts:
            status = await client.get_export_status(job_id)

            if not status:
                progress.update(task, description="[red]Failed to get status")
                return

            job_status = status.get("status", "unknown")

            if job_status == "completed":
                progress.update(task, description="[green]Export completed!")
                console.print()

                file_path = status.get("file_path")
                if file_path:
                    console.print(f"[green]File ready:[/green] {file_path}")

                    if output:
                        console.print(f"[dim]Download using: aexy report download {job_id} -o {output}[/dim]")

                return

            elif job_status == "failed":
                progress.update(task, description="[red]Export failed")
                error = status.get("error_message", "Unknown error")
                console.print(f"[red]Error:[/red] {error}")
                return

            progress.update(task, description=f"Processing... ({job_status})")
            await asyncio.sleep(5)
            attempts += 1

        console.print("[yellow]Timed out waiting for export. Check status manually.[/yellow]")


@report.command("status")
@click.argument("job_id")
def report_status(job_id: str):
    """Check status of an export job."""
    asyncio.run(_report_status(job_id))


async def _report_status(job_id: str):
    """Async implementation of report status."""
    client = AexyClient()

    with console.status("[bold green]Fetching job status..."):
        status = await client.get_export_status(job_id)

    if not status:
        console.print(f"[red]Export job {job_id} not found[/red]")
        return

    job_status = status.get("status", "unknown")
    status_style = {
        "pending": "yellow",
        "processing": "blue",
        "completed": "green",
        "failed": "red",
    }.get(job_status, "white")

    console.print(Panel(
        f"[bold]Export Job Status[/bold]\n\n"
        f"Job ID: {job_id}\n"
        f"Status: [{status_style}]{job_status.upper()}[/{status_style}]\n"
        f"Type: {status.get('export_type', '-')}\n"
        f"Format: {status.get('format', '-').upper()}",
        border_style="blue",
    ))

    if job_status == "completed":
        file_path = status.get("file_path")
        file_size = status.get("file_size_bytes", 0)

        if file_path:
            console.print(f"[green]File:[/green] {file_path}")
        if file_size:
            size_mb = file_size / 1024 / 1024
            console.print(f"[green]Size:[/green] {size_mb:.2f} MB")

    elif job_status == "failed":
        error = status.get("error_message", "Unknown error")
        console.print(f"[red]Error:[/red] {error}")


@report.command("export")
@click.argument("data_type", type=click.Choice(["developers", "teams", "skills", "analytics"]))
@click.option("--format", "-f", type=click.Choice(["csv", "json", "xlsx"]), default="csv")
@click.option("--output", "-o", required=True, help="Output file path")
def export_data(data_type: str, format: str, output: str):
    """Export raw data.

    Data types:
    - developers: All developer profiles
    - teams: All team configurations
    - skills: Skill distribution data
    - analytics: Analytics summary
    """
    asyncio.run(_export_data(data_type, format, output))


async def _export_data(data_type: str, format: str, output: str):
    """Async implementation of export data."""
    client = AexyClient()

    console.print(f"[bold]Exporting {data_type} as {format.upper()}...[/bold]")

    with console.status("[bold green]Creating export job..."):
        job = await client.create_export(
            export_type=data_type,
            format=format,
            config={"output_path": output},
        )

    if not job:
        console.print("[red]Failed to create export job[/red]")
        return

    job_id = job.get("id")
    console.print(f"[green]Export job created:[/green] {job_id}")

    await _wait_for_export(client, job_id, output)
