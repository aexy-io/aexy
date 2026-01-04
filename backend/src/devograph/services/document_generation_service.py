"""Service for AI-powered documentation generation."""

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from devograph.llm.base import AnalysisRequest, AnalysisType
from devograph.llm.gateway import get_llm_gateway
from devograph.llm.prompts import (
    DOC_API_PROMPT,
    DOC_API_SYSTEM_PROMPT,
    DOC_FUNCTION_PROMPT,
    DOC_FUNCTION_SYSTEM_PROMPT,
    DOC_GENERATION_SYSTEM_PROMPT,
    DOC_IMPROVEMENT_PROMPT,
    DOC_IMPROVEMENT_SYSTEM_PROMPT,
    DOC_MODULE_PROMPT,
    DOC_MODULE_SYSTEM_PROMPT,
    DOC_README_PROMPT,
    DOC_README_SYSTEM_PROMPT,
    DOC_UPDATE_PROMPT,
    DOC_UPDATE_SYSTEM_PROMPT,
)
from devograph.models.documentation import (
    Document,
    DocumentCodeLink,
    DocumentGenerationPrompt,
    DocumentTemplate,
    TemplateCategory,
)
from devograph.services.github_service import GitHubService

logger = logging.getLogger(__name__)


class DocumentGenerationService:
    """Service for generating documentation from code using LLMs."""

    def __init__(self, db: AsyncSession):
        """Initialize the document generation service.

        Args:
            db: Async database session.
        """
        self.db = db
        self.gateway = get_llm_gateway()

    async def generate_from_code(
        self,
        code: str,
        template_category: TemplateCategory,
        file_path: str | None = None,
        language: str | None = None,
        context: str | None = None,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Generate documentation from source code.

        Args:
            code: Source code to document.
            template_category: Type of documentation to generate.
            file_path: Optional file path for context.
            language: Programming language hint.
            context: Additional context for generation.
            developer_id: Developer ID for usage tracking.

        Returns:
            Generated documentation in TipTap format.
        """
        if not self.gateway:
            raise RuntimeError("LLM gateway not configured")

        # Select appropriate prompt based on category
        analysis_type, prompt, system_prompt = self._get_prompts_for_category(
            template_category
        )

        # Detect language if not provided
        if not language and file_path:
            language = self._detect_language(file_path)

        # Format the prompt with provided values
        formatted_prompt = prompt.format(
            code=code,
            file_path=file_path or "unknown",
            language=language or "unknown",
            context=context or "No additional context provided.",
        )

        # Create analysis request
        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=analysis_type,
            context={
                "system_prompt": system_prompt,
                "output_format": "tiptap_json",
            },
            file_path=file_path,
            language_hint=language,
        )

        # Execute LLM request
        result = await self.gateway.analyze(
            request,
            use_cache=False,  # Don't cache doc generation
            db=self.db,
            developer_id=developer_id,
        )

        # Parse the result
        try:
            doc_content = json.loads(result.raw_response)
            return doc_content
        except json.JSONDecodeError:
            logger.error(f"Failed to parse LLM response as JSON: {result.raw_response[:200]}")
            # Return a basic document structure with the raw content
            return self._create_fallback_document(result.raw_response, template_category)

    async def generate_from_repository(
        self,
        github_service: GitHubService,
        repository_full_name: str,
        path: str,
        template_category: TemplateCategory,
        branch: str = "main",
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Generate documentation from a repository path.

        Args:
            github_service: GitHub service for fetching code.
            repository_full_name: Full repository name (owner/repo).
            path: Path within the repository.
            template_category: Type of documentation to generate.
            branch: Git branch to use.
            developer_id: Developer ID for usage tracking.

        Returns:
            Generated documentation in TipTap format.
        """
        # Fetch file content from GitHub
        file_info = await github_service.get_file_content(
            repository_full_name, path, branch
        )

        if not file_info:
            raise ValueError(f"Could not fetch file content from {path}")

        content = file_info.get("content", "")

        # Detect language from file extension
        language = self._detect_language(path)

        return await self.generate_from_code(
            code=content,
            template_category=template_category,
            file_path=path,
            language=language,
            developer_id=developer_id,
        )

    async def generate_module_documentation(
        self,
        github_service: GitHubService,
        repository_full_name: str,
        directory_path: str,
        branch: str = "main",
        developer_id: str | None = None,
        custom_prompt: str | None = None,
    ) -> dict[str, Any]:
        """Generate documentation for a module/directory.

        Args:
            github_service: GitHub service for fetching code.
            repository_full_name: Full repository name (owner/repo).
            directory_path: Path to the directory.
            branch: Git branch to use.
            developer_id: Developer ID for usage tracking.
            custom_prompt: Optional custom instructions for the AI.

        Returns:
            Generated module documentation in TipTap format.
        """
        if not self.gateway:
            raise RuntimeError("LLM gateway not configured")

        # Get directory contents
        contents = await github_service.get_directory_contents(
            repository_full_name, directory_path, branch
        )

        if not contents:
            raise ValueError(f"Could not fetch directory contents from {directory_path}")

        # Build file list
        files_list = []
        key_files_content = []

        for item in contents:
            files_list.append(f"- {item['name']} ({item['type']})")

            # Fetch key files (entry points, README, etc.)
            if item["type"] == "file" and self._is_key_file(item["name"]):
                try:
                    file_content = await github_service.get_file_content(
                        repository_full_name,
                        f"{directory_path}/{item['name']}",
                        branch,
                    )
                    if file_content:
                        key_files_content.append(
                            f"### {item['name']}\n```\n{file_content.get('content', '')[:2000]}\n```"
                        )
                except Exception as e:
                    logger.warning(f"Failed to fetch {item['name']}: {e}")

        # Detect primary language
        language = self._detect_primary_language(contents)

        # Format prompt - include custom instructions if provided
        base_prompt = DOC_MODULE_PROMPT.format(
            path=directory_path,
            language=language,
            files_list="\n".join(files_list),
            key_files="\n\n".join(key_files_content) if key_files_content else "No key files fetched.",
            dependencies="See package configuration files.",
        )

        if custom_prompt:
            formatted_prompt = f"{base_prompt}\n\n## Additional Instructions\n{custom_prompt}"
        else:
            formatted_prompt = base_prompt

        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=AnalysisType.DOC_MODULE,
            context={
                "system_prompt": DOC_MODULE_SYSTEM_PROMPT,
                "output_format": "tiptap_json",
            },
            file_path=directory_path,
            language_hint=language,
        )

        result = await self.gateway.analyze(
            request,
            use_cache=False,
            db=self.db,
            developer_id=developer_id,
        )

        try:
            return json.loads(result.raw_response)
        except json.JSONDecodeError:
            return self._create_fallback_document(result.raw_response, TemplateCategory.MODULE_DOCS)

    async def update_documentation(
        self,
        existing_doc: dict[str, Any],
        old_code: str,
        new_code: str,
        language: str | None = None,
        changes_summary: str | None = None,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Update existing documentation based on code changes.

        Args:
            existing_doc: Existing document content in TipTap format.
            old_code: Previous version of the code.
            new_code: New version of the code.
            language: Programming language.
            changes_summary: Summary of changes.
            developer_id: Developer ID for usage tracking.

        Returns:
            Updated documentation with change details.
        """
        if not self.gateway:
            raise RuntimeError("LLM gateway not configured")

        formatted_prompt = DOC_UPDATE_PROMPT.format(
            existing_doc=json.dumps(existing_doc, indent=2),
            old_code=old_code,
            new_code=new_code,
            language=language or "unknown",
            changes_summary=changes_summary or "Changes not specified.",
        )

        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=AnalysisType.DOC_UPDATE,
            context={
                "system_prompt": DOC_UPDATE_SYSTEM_PROMPT,
                "output_format": "tiptap_json",
            },
            language_hint=language,
        )

        result = await self.gateway.analyze(
            request,
            use_cache=False,
            db=self.db,
            developer_id=developer_id,
        )

        try:
            return json.loads(result.raw_response)
        except json.JSONDecodeError:
            logger.error("Failed to parse update response")
            return {"updated_doc": existing_doc, "changes_made": [], "suggestions": []}

    async def suggest_improvements(
        self,
        documentation: dict[str, Any],
        code: str | None = None,
        category: TemplateCategory = TemplateCategory.CUSTOM,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Analyze documentation and suggest improvements.

        Args:
            documentation: Documentation content in TipTap format.
            code: Related source code if available.
            category: Documentation category.
            developer_id: Developer ID for usage tracking.

        Returns:
            Improvement suggestions.
        """
        if not self.gateway:
            raise RuntimeError("LLM gateway not configured")

        formatted_prompt = DOC_IMPROVEMENT_PROMPT.format(
            documentation=json.dumps(documentation, indent=2),
            code=code or "No source code provided.",
            language="unknown",
            category=category.value,
        )

        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=AnalysisType.DOC_IMPROVEMENT,
            context={
                "system_prompt": DOC_IMPROVEMENT_SYSTEM_PROMPT,
                "output_format": "json",
            },
        )

        result = await self.gateway.analyze(
            request,
            use_cache=True,
            db=self.db,
            developer_id=developer_id,
        )

        try:
            return json.loads(result.raw_response)
        except json.JSONDecodeError:
            return {
                "quality_score": 0,
                "improvements": [],
                "missing_sections": [],
                "overall_assessment": "Could not analyze documentation.",
            }

    async def generate_from_template(
        self,
        template: DocumentTemplate,
        variables: dict[str, Any],
        code: str | None = None,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Generate documentation using a template with variables.

        Args:
            template: Document template to use.
            variables: Variable values for the template.
            code: Source code to document.
            developer_id: Developer ID for usage tracking.

        Returns:
            Generated documentation in TipTap format.
        """
        if not self.gateway:
            raise RuntimeError("LLM gateway not configured")

        # Build the prompt from template
        prompt = template.prompt_template
        for var_name, var_value in variables.items():
            prompt = prompt.replace(f"{{{var_name}}}", str(var_value))

        # Add code if provided
        if code:
            prompt += f"\n\nSource code:\n```\n{code}\n```"

        request = AnalysisRequest(
            content=prompt,
            analysis_type=self._category_to_analysis_type(template.category),
            context={
                "system_prompt": template.system_prompt or DOC_GENERATION_SYSTEM_PROMPT,
                "output_format": "tiptap_json",
                "template_id": str(template.id),
            },
        )

        result = await self.gateway.analyze(
            request,
            use_cache=False,
            db=self.db,
            developer_id=developer_id,
        )

        try:
            return json.loads(result.raw_response)
        except json.JSONDecodeError:
            return self._create_fallback_document(result.raw_response, template.category)

    def _get_prompts_for_category(
        self, category: TemplateCategory
    ) -> tuple[AnalysisType, str, str]:
        """Get the appropriate prompts for a template category.

        Args:
            category: Template category.

        Returns:
            Tuple of (analysis_type, prompt, system_prompt).
        """
        mapping = {
            TemplateCategory.API_DOCS: (
                AnalysisType.DOC_API,
                DOC_API_PROMPT,
                DOC_API_SYSTEM_PROMPT,
            ),
            TemplateCategory.README: (
                AnalysisType.DOC_README,
                DOC_README_PROMPT,
                DOC_README_SYSTEM_PROMPT,
            ),
            TemplateCategory.FUNCTION_DOCS: (
                AnalysisType.DOC_FUNCTION,
                DOC_FUNCTION_PROMPT,
                DOC_FUNCTION_SYSTEM_PROMPT,
            ),
            TemplateCategory.MODULE_DOCS: (
                AnalysisType.DOC_MODULE,
                DOC_MODULE_PROMPT,
                DOC_MODULE_SYSTEM_PROMPT,
            ),
        }

        return mapping.get(
            category,
            (AnalysisType.DOC_FUNCTION, DOC_FUNCTION_PROMPT, DOC_FUNCTION_SYSTEM_PROMPT),
        )

    def _category_to_analysis_type(self, category: TemplateCategory) -> AnalysisType:
        """Convert template category to analysis type.

        Args:
            category: Template category.

        Returns:
            Corresponding analysis type.
        """
        mapping = {
            TemplateCategory.API_DOCS: AnalysisType.DOC_API,
            TemplateCategory.README: AnalysisType.DOC_README,
            TemplateCategory.FUNCTION_DOCS: AnalysisType.DOC_FUNCTION,
            TemplateCategory.MODULE_DOCS: AnalysisType.DOC_MODULE,
            TemplateCategory.GUIDES: AnalysisType.DOC_FUNCTION,
            TemplateCategory.CUSTOM: AnalysisType.DOC_FUNCTION,
        }
        return mapping.get(category, AnalysisType.DOC_FUNCTION)

    def _detect_language(self, file_path: str) -> str:
        """Detect programming language from file extension.

        Args:
            file_path: Path to the file.

        Returns:
            Detected language name.
        """
        extension_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".jsx": "javascript",
            ".java": "java",
            ".go": "go",
            ".rs": "rust",
            ".rb": "ruby",
            ".php": "php",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
            ".swift": "swift",
            ".kt": "kotlin",
            ".scala": "scala",
            ".ex": "elixir",
            ".exs": "elixir",
        }

        for ext, lang in extension_map.items():
            if file_path.lower().endswith(ext):
                return lang

        return "unknown"

    def _detect_primary_language(self, contents: list[dict]) -> str:
        """Detect the primary language in a directory.

        Args:
            contents: Directory contents from GitHub.

        Returns:
            Primary language detected.
        """
        lang_counts: dict[str, int] = {}

        for item in contents:
            if item["type"] == "file":
                lang = self._detect_language(item["name"])
                if lang != "unknown":
                    lang_counts[lang] = lang_counts.get(lang, 0) + 1

        if lang_counts:
            return max(lang_counts, key=lang_counts.get)

        return "unknown"

    def _is_key_file(self, filename: str) -> bool:
        """Check if a file is a key entry point or documentation file.

        Args:
            filename: Name of the file.

        Returns:
            True if the file is a key file.
        """
        key_patterns = [
            "__init__.py",
            "index.ts",
            "index.js",
            "main.py",
            "main.go",
            "mod.rs",
            "lib.rs",
            "README.md",
            "package.json",
            "setup.py",
            "pyproject.toml",
            "Cargo.toml",
        ]
        return filename.lower() in [p.lower() for p in key_patterns]

    def _create_fallback_document(
        self, content: str, category: TemplateCategory
    ) -> dict[str, Any]:
        """Create a fallback TipTap document from raw content.

        Args:
            content: Raw content from LLM.
            category: Document category.

        Returns:
            Basic TipTap document structure.
        """
        return {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": f"Generated {category.value} Documentation"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": content[:5000]}],
                },
            ],
            "metadata": {
                "generated": True,
                "fallback": True,
                "category": category.value,
            },
        }
