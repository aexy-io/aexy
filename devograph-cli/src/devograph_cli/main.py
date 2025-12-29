"""Devograph CLI - Main entry point."""

import click
from rich.console import Console

from devograph_cli import __version__
from devograph_cli.commands import profile, team, match, insights, report
from devograph_cli.api import DevographClient

console = Console()


@click.group()
@click.version_option(version=__version__, prog_name="devograph")
@click.option("--api-url", envvar="DEVOGRAPH_API_URL", help="Devograph API URL")
@click.pass_context
def cli(ctx, api_url: str | None):
    """Devograph CLI - Developer Intelligence Platform.

    Analyze developer skills, team dynamics, and get AI-powered insights
    from your command line.

    \b
    Examples:
        devograph profile show @username
        devograph team skills
        devograph match "Fix authentication bug"
        devograph insights attrition @username
        devograph report generate weekly
    """
    ctx.ensure_object(dict)
    if api_url:
        ctx.obj["api_url"] = api_url


@cli.command()
@click.argument("token")
def login(token: str):
    """Authenticate with Devograph API.

    Get your API token from the Devograph web dashboard under Settings > API.
    """
    client = DevographClient()
    client.set_token(token)
    console.print("[green]Successfully logged in![/green]")
    console.print("[dim]Token stored securely in system keychain.[/dim]")


@cli.command()
def logout():
    """Log out and clear stored credentials."""
    client = DevographClient()
    client.logout()
    console.print("[green]Successfully logged out![/green]")


@cli.command()
def status():
    """Check authentication and API status."""
    client = DevographClient()

    console.print(f"[bold]API URL:[/bold] {client.base_url}")

    if client.is_authenticated:
        console.print("[green]Authentication:[/green] Logged in")
    else:
        console.print("[yellow]Authentication:[/yellow] Not logged in")
        console.print("[dim]Use 'devograph login <token>' to authenticate[/dim]")


@cli.command()
def config():
    """Show current configuration."""
    import os

    console.print("[bold]Devograph CLI Configuration[/bold]")
    console.print()

    api_url = os.environ.get("DEVOGRAPH_API_URL", "http://localhost:8000/api")
    console.print(f"API URL: {api_url}")
    console.print(f"  [dim]Set via DEVOGRAPH_API_URL environment variable[/dim]")

    client = DevographClient()
    console.print(f"Authenticated: {'Yes' if client.is_authenticated else 'No'}")


# Add command groups
cli.add_command(profile)
cli.add_command(team)
cli.add_command(match)
cli.add_command(insights)
cli.add_command(report)


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
