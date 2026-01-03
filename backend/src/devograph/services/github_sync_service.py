"""Service for syncing documents to/from GitHub repositories."""

import base64
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.documentation import Document, DocumentGitHubSync, DocumentVersion
from devograph.services.github_app_service import GitHubAppService

logger = logging.getLogger(__name__)


class GitHubSyncService:
    """Service for exporting documents to GitHub and importing from GitHub."""

    def __init__(self, db: AsyncSession):
        """Initialize the GitHub sync service.

        Args:
            db: Async database session.
        """
        self.db = db
        self.github_service = GitHubAppService(db)

    async def setup_sync(
        self,
        document_id: str,
        repository_id: str,
        file_path: str,
        branch: str = "main",
        sync_direction: str = "bidirectional",
        auto_export: bool = False,
        auto_import: bool = False,
    ) -> DocumentGitHubSync:
        """Set up GitHub sync for a document.

        Args:
            document_id: Document ID.
            repository_id: Repository ID to sync with.
            file_path: Path in the repository (e.g., docs/README.md).
            branch: Branch to sync with.
            sync_direction: export_only, import_only, or bidirectional.
            auto_export: Auto-export on document save.
            auto_import: Auto-import on repository changes.

        Returns:
            Created sync configuration.
        """
        # Check if sync already exists
        stmt = select(DocumentGitHubSync).where(
            DocumentGitHubSync.document_id == document_id,
            DocumentGitHubSync.repository_id == repository_id,
            DocumentGitHubSync.file_path == file_path,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.branch = branch
            existing.sync_direction = sync_direction
            existing.auto_export = auto_export
            existing.auto_import = auto_import
            await self.db.flush()
            return existing

        # Create new sync config
        sync_config = DocumentGitHubSync(
            id=str(uuid4()),
            document_id=document_id,
            repository_id=repository_id,
            file_path=file_path,
            branch=branch,
            sync_direction=sync_direction,
            auto_export=auto_export,
            auto_import=auto_import,
        )
        self.db.add(sync_config)
        await self.db.flush()

        return sync_config

    async def export_to_github(
        self,
        sync_id: str,
        developer_id: str,
        commit_message: str | None = None,
    ) -> dict[str, Any]:
        """Export a document to GitHub as markdown.

        Args:
            sync_id: Sync configuration ID.
            developer_id: Developer performing the export.
            commit_message: Optional commit message.

        Returns:
            Export result with commit SHA.
        """
        # Get sync config with document
        stmt = (
            select(DocumentGitHubSync)
            .options(selectinload(DocumentGitHubSync.document))
            .where(DocumentGitHubSync.id == sync_id)
        )
        result = await self.db.execute(stmt)
        sync_config = result.scalar_one_or_none()

        if not sync_config:
            raise ValueError("Sync configuration not found")

        if sync_config.sync_direction == "import_only":
            raise ValueError("This sync is configured for import only")

        document = sync_config.document
        if not document:
            raise ValueError("Document not found")

        # Convert document to markdown
        markdown_content = self._tiptap_to_markdown(document.content, document.title)

        # Calculate content hash
        content_hash = hashlib.sha256(markdown_content.encode()).hexdigest()

        # Check if content has changed
        if sync_config.content_hash == content_hash:
            return {
                "status": "no_changes",
                "message": "Document content has not changed since last export",
            }

        # Get repository info
        from devograph.models.repository import Repository

        stmt = select(Repository).where(Repository.id == sync_config.repository_id)
        result = await self.db.execute(stmt)
        repository = result.scalar_one_or_none()

        if not repository:
            raise ValueError("Repository not found")

        # Get installation token
        token_result = await self.github_service.get_installation_token_for_developer(
            developer_id
        )
        if not token_result:
            raise ValueError("Could not get GitHub installation token")

        installation_id, token = token_result

        # Create or update file in GitHub
        owner, repo = repository.full_name.split("/")

        # Check if file exists
        existing_sha = None
        try:
            existing_file = await self.github_service.get_file_content(
                installation_id=installation_id,
                owner=owner,
                repo=repo,
                path=sync_config.file_path,
                ref=sync_config.branch,
            )
            if existing_file:
                existing_sha = existing_file.get("sha")
        except Exception:
            # File doesn't exist
            pass

        # Create commit message
        if not commit_message:
            commit_message = f"docs: Update {sync_config.file_path}"
            if document.title != "Untitled":
                commit_message = f"docs: Update {document.title}"

        # Create or update file via GitHub API
        commit_sha = await self._create_or_update_file(
            token=token,
            owner=owner,
            repo=repo,
            path=sync_config.file_path,
            content=markdown_content,
            message=commit_message,
            branch=sync_config.branch,
            sha=existing_sha,
        )

        # Update sync config
        sync_config.last_exported_at = datetime.now(timezone.utc)
        sync_config.last_export_commit = commit_sha
        sync_config.content_hash = content_hash
        await self.db.commit()

        return {
            "status": "success",
            "commit_sha": commit_sha,
            "file_path": sync_config.file_path,
            "branch": sync_config.branch,
        }

    async def import_from_github(
        self,
        sync_id: str,
        developer_id: str,
        create_version: bool = True,
    ) -> dict[str, Any]:
        """Import a document from GitHub markdown.

        Args:
            sync_id: Sync configuration ID.
            developer_id: Developer performing the import.
            create_version: Whether to create a version before overwriting.

        Returns:
            Import result.
        """
        # Get sync config with document
        stmt = (
            select(DocumentGitHubSync)
            .options(selectinload(DocumentGitHubSync.document))
            .where(DocumentGitHubSync.id == sync_id)
        )
        result = await self.db.execute(stmt)
        sync_config = result.scalar_one_or_none()

        if not sync_config:
            raise ValueError("Sync configuration not found")

        if sync_config.sync_direction == "export_only":
            raise ValueError("This sync is configured for export only")

        document = sync_config.document
        if not document:
            raise ValueError("Document not found")

        # Get repository info
        from devograph.models.repository import Repository

        stmt = select(Repository).where(Repository.id == sync_config.repository_id)
        result = await self.db.execute(stmt)
        repository = result.scalar_one_or_none()

        if not repository:
            raise ValueError("Repository not found")

        # Get installation token
        token_result = await self.github_service.get_installation_token_for_developer(
            developer_id
        )
        if not token_result:
            raise ValueError("Could not get GitHub installation token")

        installation_id, _ = token_result

        # Get file content from GitHub
        owner, repo = repository.full_name.split("/")
        file_content = await self.github_service.get_file_content(
            installation_id=installation_id,
            owner=owner,
            repo=repo,
            path=sync_config.file_path,
            ref=sync_config.branch,
        )

        if not file_content:
            raise ValueError(f"File not found: {sync_config.file_path}")

        # Decode content
        content_bytes = base64.b64decode(file_content["content"])
        markdown_content = content_bytes.decode("utf-8")

        # Calculate content hash
        content_hash = hashlib.sha256(markdown_content.encode()).hexdigest()

        # Check if content has changed
        if sync_config.content_hash == content_hash:
            return {
                "status": "no_changes",
                "message": "GitHub file has not changed since last import",
            }

        # Create version before overwriting
        if create_version and document.content:
            from devograph.services.document_service import DocumentService

            doc_service = DocumentService(self.db)
            await doc_service.create_version(
                document_id=str(document.id),
                developer_id=developer_id,
                change_summary=f"Auto-saved before import from GitHub",
                is_auto_save=True,
            )

        # Convert markdown to TipTap JSON
        tiptap_content, title = self._markdown_to_tiptap(markdown_content)

        # Update document
        document.content = tiptap_content
        if title and document.title == "Untitled":
            document.title = title
        document.last_edited_by_id = developer_id
        document.updated_at = datetime.now(timezone.utc)

        # Update sync config
        sync_config.last_imported_at = datetime.now(timezone.utc)
        sync_config.last_import_commit = file_content.get("sha")
        sync_config.content_hash = content_hash

        await self.db.commit()

        return {
            "status": "success",
            "file_sha": file_content.get("sha"),
            "file_path": sync_config.file_path,
            "title": title,
        }

    async def get_sync_configs(
        self,
        document_id: str,
    ) -> list[DocumentGitHubSync]:
        """Get all sync configurations for a document.

        Args:
            document_id: Document ID.

        Returns:
            List of sync configurations.
        """
        stmt = (
            select(DocumentGitHubSync)
            .options(selectinload(DocumentGitHubSync.repository))
            .where(DocumentGitHubSync.document_id == document_id)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_sync(self, sync_id: str) -> bool:
        """Delete a sync configuration.

        Args:
            sync_id: Sync configuration ID.

        Returns:
            True if deleted.
        """
        stmt = select(DocumentGitHubSync).where(DocumentGitHubSync.id == sync_id)
        result = await self.db.execute(stmt)
        sync_config = result.scalar_one_or_none()

        if sync_config:
            await self.db.delete(sync_config)
            await self.db.commit()
            return True

        return False

    async def _create_or_update_file(
        self,
        token: str,
        owner: str,
        repo: str,
        path: str,
        content: str,
        message: str,
        branch: str,
        sha: str | None = None,
    ) -> str:
        """Create or update a file in GitHub.

        Returns the commit SHA.
        """
        import httpx

        url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Base64 encode content
        content_base64 = base64.b64encode(content.encode()).decode()

        data = {
            "message": message,
            "content": content_base64,
            "branch": branch,
        }

        if sha:
            data["sha"] = sha

        async with httpx.AsyncClient() as client:
            response = await client.put(url, headers=headers, json=data)
            response.raise_for_status()
            result = response.json()
            return result["commit"]["sha"]

    def _tiptap_to_markdown(
        self,
        content: dict,
        title: str | None = None,
    ) -> str:
        """Convert TipTap JSON to Markdown.

        Args:
            content: TipTap JSON content.
            title: Optional document title to prepend.

        Returns:
            Markdown string.
        """
        lines = []

        # Add title as H1 if provided
        if title and title != "Untitled":
            lines.append(f"# {title}")
            lines.append("")

        def process_node(node: dict, depth: int = 0) -> list[str]:
            """Process a TipTap node and return markdown lines."""
            result = []
            node_type = node.get("type", "")

            if node_type == "doc":
                for child in node.get("content", []):
                    result.extend(process_node(child, depth))

            elif node_type == "paragraph":
                text = self._extract_text(node)
                result.append(text)
                result.append("")

            elif node_type == "heading":
                level = node.get("attrs", {}).get("level", 1)
                text = self._extract_text(node)
                result.append(f"{'#' * level} {text}")
                result.append("")

            elif node_type == "bulletList":
                for item in node.get("content", []):
                    result.extend(process_node(item, depth))
                result.append("")

            elif node_type == "orderedList":
                for i, item in enumerate(node.get("content", []), 1):
                    item_lines = process_node(item, depth)
                    if item_lines:
                        item_lines[0] = f"{i}. " + item_lines[0].lstrip("- ")
                    result.extend(item_lines)
                result.append("")

            elif node_type == "listItem":
                for child in node.get("content", []):
                    child_lines = process_node(child, depth + 1)
                    for line in child_lines:
                        if line.strip():
                            prefix = "  " * depth + "- "
                            result.append(prefix + line.strip())

            elif node_type == "codeBlock":
                lang = node.get("attrs", {}).get("language", "")
                text = self._extract_text(node)
                result.append(f"```{lang}")
                result.append(text)
                result.append("```")
                result.append("")

            elif node_type == "blockquote":
                for child in node.get("content", []):
                    child_lines = process_node(child, depth)
                    for line in child_lines:
                        if line.strip():
                            result.append(f"> {line}")
                result.append("")

            elif node_type == "horizontalRule":
                result.append("---")
                result.append("")

            elif node_type == "table":
                table_rows = []
                for row in node.get("content", []):
                    cells = []
                    for cell in row.get("content", []):
                        cell_text = self._extract_text(cell)
                        cells.append(cell_text)
                    table_rows.append(cells)

                if table_rows:
                    # Header row
                    result.append("| " + " | ".join(table_rows[0]) + " |")
                    result.append("| " + " | ".join(["---"] * len(table_rows[0])) + " |")
                    # Data rows
                    for row in table_rows[1:]:
                        result.append("| " + " | ".join(row) + " |")
                result.append("")

            elif node_type == "taskList":
                for item in node.get("content", []):
                    checked = item.get("attrs", {}).get("checked", False)
                    text = self._extract_text(item)
                    checkbox = "[x]" if checked else "[ ]"
                    result.append(f"- {checkbox} {text}")
                result.append("")

            elif node_type == "taskItem":
                checked = node.get("attrs", {}).get("checked", False)
                text = self._extract_text(node)
                checkbox = "[x]" if checked else "[ ]"
                result.append(f"- {checkbox} {text}")

            elif node_type == "image":
                attrs = node.get("attrs", {})
                src = attrs.get("src", "")
                alt = attrs.get("alt", "")
                result.append(f"![{alt}]({src})")
                result.append("")

            return result

        # Process content
        if content:
            lines.extend(process_node(content))

        # Clean up multiple empty lines
        markdown = "\n".join(lines)
        markdown = re.sub(r"\n{3,}", "\n\n", markdown)

        return markdown.strip()

    def _extract_text(self, node: dict) -> str:
        """Extract plain text from a TipTap node with inline formatting."""
        if node.get("type") == "text":
            text = node.get("text", "")
            marks = node.get("marks", [])

            for mark in marks:
                mark_type = mark.get("type", "")
                if mark_type == "bold":
                    text = f"**{text}**"
                elif mark_type == "italic":
                    text = f"*{text}*"
                elif mark_type == "strike":
                    text = f"~~{text}~~"
                elif mark_type == "code":
                    text = f"`{text}`"
                elif mark_type == "link":
                    href = mark.get("attrs", {}).get("href", "")
                    text = f"[{text}]({href})"

            return text

        # Recurse into children
        parts = []
        for child in node.get("content", []):
            parts.append(self._extract_text(child))

        return "".join(parts)

    def _markdown_to_tiptap(
        self,
        markdown: str,
    ) -> tuple[dict, str | None]:
        """Convert Markdown to TipTap JSON.

        Args:
            markdown: Markdown string.

        Returns:
            Tuple of (TipTap JSON content, extracted title).
        """
        lines = markdown.split("\n")
        content = []
        title = None
        i = 0

        while i < len(lines):
            line = lines[i]

            # Skip empty lines
            if not line.strip():
                i += 1
                continue

            # Headings
            if line.startswith("#"):
                match = re.match(r"^(#{1,6})\s+(.+)$", line)
                if match:
                    level = len(match.group(1))
                    text = match.group(2)

                    # Use first H1 as title
                    if level == 1 and title is None:
                        title = text
                        i += 1
                        continue

                    content.append({
                        "type": "heading",
                        "attrs": {"level": level},
                        "content": self._parse_inline_text(text),
                    })
                    i += 1
                    continue

            # Code blocks
            if line.startswith("```"):
                lang = line[3:].strip()
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].startswith("```"):
                    code_lines.append(lines[i])
                    i += 1
                content.append({
                    "type": "codeBlock",
                    "attrs": {"language": lang},
                    "content": [{"type": "text", "text": "\n".join(code_lines)}],
                })
                i += 1
                continue

            # Blockquotes
            if line.startswith(">"):
                quote_lines = []
                while i < len(lines) and lines[i].startswith(">"):
                    quote_lines.append(lines[i][1:].strip())
                    i += 1
                content.append({
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": self._parse_inline_text(" ".join(quote_lines)),
                        }
                    ],
                })
                continue

            # Horizontal rule
            if re.match(r"^[-*_]{3,}$", line):
                content.append({"type": "horizontalRule"})
                i += 1
                continue

            # Lists
            if re.match(r"^[-*+]\s", line) or re.match(r"^\d+\.\s", line):
                is_ordered = re.match(r"^\d+\.\s", line) is not None
                items = []

                while i < len(lines):
                    line = lines[i]
                    if re.match(r"^[-*+]\s", line):
                        items.append({
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": self._parse_inline_text(line[2:].strip()),
                                }
                            ],
                        })
                    elif re.match(r"^\d+\.\s", line):
                        text = re.sub(r"^\d+\.\s", "", line)
                        items.append({
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": self._parse_inline_text(text.strip()),
                                }
                            ],
                        })
                    elif line.strip() == "":
                        break
                    else:
                        break
                    i += 1

                content.append({
                    "type": "orderedList" if is_ordered else "bulletList",
                    "content": items,
                })
                continue

            # Task lists
            if re.match(r"^[-*+]\s\[[ x]\]\s", line):
                items = []

                while i < len(lines) and re.match(r"^[-*+]\s\[[ x]\]\s", lines[i]):
                    match = re.match(r"^[-*+]\s\[([ x])\]\s(.+)$", lines[i])
                    if match:
                        checked = match.group(1) == "x"
                        text = match.group(2)
                        items.append({
                            "type": "taskItem",
                            "attrs": {"checked": checked},
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": self._parse_inline_text(text),
                                }
                            ],
                        })
                    i += 1

                content.append({
                    "type": "taskList",
                    "content": items,
                })
                continue

            # Regular paragraph
            para_lines = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not lines[i].startswith("#"):
                if re.match(r"^[-*+]\s|^\d+\.\s|^```|^>|^[-*_]{3,}$", lines[i]):
                    break
                para_lines.append(lines[i])
                i += 1

            content.append({
                "type": "paragraph",
                "content": self._parse_inline_text(" ".join(para_lines)),
            })

        return {"type": "doc", "content": content}, title

    def _parse_inline_text(self, text: str) -> list[dict]:
        """Parse inline markdown formatting into TipTap marks."""
        if not text:
            return []

        result = []
        i = 0

        while i < len(text):
            # Bold
            match = re.match(r"\*\*(.+?)\*\*", text[i:])
            if match:
                result.append({
                    "type": "text",
                    "text": match.group(1),
                    "marks": [{"type": "bold"}],
                })
                i += len(match.group(0))
                continue

            # Italic
            match = re.match(r"\*(.+?)\*", text[i:])
            if match:
                result.append({
                    "type": "text",
                    "text": match.group(1),
                    "marks": [{"type": "italic"}],
                })
                i += len(match.group(0))
                continue

            # Strike
            match = re.match(r"~~(.+?)~~", text[i:])
            if match:
                result.append({
                    "type": "text",
                    "text": match.group(1),
                    "marks": [{"type": "strike"}],
                })
                i += len(match.group(0))
                continue

            # Inline code
            match = re.match(r"`(.+?)`", text[i:])
            if match:
                result.append({
                    "type": "text",
                    "text": match.group(1),
                    "marks": [{"type": "code"}],
                })
                i += len(match.group(0))
                continue

            # Links
            match = re.match(r"\[(.+?)\]\((.+?)\)", text[i:])
            if match:
                result.append({
                    "type": "text",
                    "text": match.group(1),
                    "marks": [{"type": "link", "attrs": {"href": match.group(2)}}],
                })
                i += len(match.group(0))
                continue

            # Plain text - collect until next special char
            plain_text = ""
            while i < len(text) and text[i] not in "*`[~":
                plain_text += text[i]
                i += 1

            if plain_text:
                result.append({"type": "text", "text": plain_text})

        return result if result else [{"type": "text", "text": text}]
