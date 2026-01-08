"""Unit tests for ProfileAnalyzer service - TDD approach."""

import pytest

from aexy.services.profile_analyzer import ProfileAnalyzer


class TestLanguageDetection:
    """Test language detection from file extensions."""

    def test_detect_python_from_extension(self):
        """Should detect Python from .py extension."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("main.py") == "Python"
        assert analyzer.detect_language_from_extension("src/utils.py") == "Python"

    def test_detect_typescript_from_extension(self):
        """Should detect TypeScript from .ts and .tsx extensions."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("app.ts") == "TypeScript"
        assert analyzer.detect_language_from_extension("Component.tsx") == "TypeScript"

    def test_detect_javascript_from_extension(self):
        """Should detect JavaScript from .js and .jsx extensions."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("index.js") == "JavaScript"
        assert analyzer.detect_language_from_extension("App.jsx") == "JavaScript"

    def test_detect_go_from_extension(self):
        """Should detect Go from .go extension."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("main.go") == "Go"

    def test_detect_rust_from_extension(self):
        """Should detect Rust from .rs extension."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("lib.rs") == "Rust"

    def test_unknown_extension_returns_none(self):
        """Should return None for unknown file extensions."""
        analyzer = ProfileAnalyzer()
        assert analyzer.detect_language_from_extension("README.md") is None
        assert analyzer.detect_language_from_extension("config.yaml") is None
        assert analyzer.detect_language_from_extension("Dockerfile") is None

    def test_extract_languages_from_files(self):
        """Should count languages from a list of file paths."""
        analyzer = ProfileAnalyzer()
        files = [
            "src/main.py",
            "src/utils.py",
            "src/api.py",
            "frontend/app.ts",
            "frontend/components.tsx",
            "README.md",
        ]
        result = analyzer.extract_languages_from_files(files)

        assert result["Python"] == 3
        assert result["TypeScript"] == 2
        assert "README.md" not in result


class TestCommitAnalysis:
    """Test commit analysis functionality."""

    def test_analyze_commits_extracts_languages(self, sample_commits_batch):
        """Should extract language distribution from commits."""
        analyzer = ProfileAnalyzer()
        language_commits, language_lines = analyzer.analyze_commits(sample_commits_batch)

        assert "Python" in language_commits
        assert "TypeScript" in language_commits
        assert language_commits["Python"] >= 3  # auth.py, models.py, etl.py, transform.py

    def test_analyze_commits_counts_lines(self, sample_commits_batch):
        """Should count lines of code per language."""
        analyzer = ProfileAnalyzer()
        _, language_lines = analyzer.analyze_commits(sample_commits_batch)

        assert language_lines["Python"] > 0
        assert language_lines["TypeScript"] > 0

    def test_analyze_empty_commits(self):
        """Should handle empty commit list."""
        analyzer = ProfileAnalyzer()
        language_commits, language_lines = analyzer.analyze_commits([])

        assert language_commits == {}
        assert language_lines == {}


class TestProficiencyScoring:
    """Test proficiency score calculation."""

    def test_calculate_proficiency_with_high_activity(self):
        """Should give higher scores for more activity."""
        analyzer = ProfileAnalyzer()
        score = analyzer.calculate_proficiency_score(
            commits_count=100,
            lines_of_code=5000,
            total_commits=100,
            total_lines=5000,
        )
        assert score >= 90  # High score for single-language developer

    def test_calculate_proficiency_with_mixed_activity(self):
        """Should give proportional scores for mixed language activity."""
        analyzer = ProfileAnalyzer()
        score = analyzer.calculate_proficiency_score(
            commits_count=50,
            lines_of_code=2500,
            total_commits=100,
            total_lines=5000,
        )
        assert 40 <= score <= 60  # About 50% activity

    def test_calculate_proficiency_with_low_activity(self):
        """Should give lower scores for minimal activity."""
        analyzer = ProfileAnalyzer()
        score = analyzer.calculate_proficiency_score(
            commits_count=5,
            lines_of_code=100,
            total_commits=100,
            total_lines=5000,
        )
        assert score < 20

    def test_calculate_proficiency_with_zero_totals(self):
        """Should return 0 when there's no activity."""
        analyzer = ProfileAnalyzer()
        score = analyzer.calculate_proficiency_score(
            commits_count=0,
            lines_of_code=0,
            total_commits=0,
            total_lines=0,
        )
        assert score == 0.0


class TestLanguageSkillBuilding:
    """Test building language skill profiles."""

    def test_build_language_skills_creates_sorted_list(self):
        """Should build sorted list of language skills."""
        analyzer = ProfileAnalyzer()
        language_commits = {"Python": 50, "TypeScript": 30, "Go": 20}
        language_lines = {"Python": 5000, "TypeScript": 3000, "Go": 2000}

        skills = analyzer.build_language_skills(language_commits, language_lines)

        assert len(skills) == 3
        assert skills[0].name == "Python"  # Highest should be first
        assert skills[0].proficiency_score >= skills[1].proficiency_score

    def test_build_language_skills_includes_metrics(self):
        """Should include all metrics in skill objects."""
        analyzer = ProfileAnalyzer()
        language_commits = {"Python": 100}
        language_lines = {"Python": 10000}

        skills = analyzer.build_language_skills(language_commits, language_lines)

        assert skills[0].name == "Python"
        assert skills[0].commits_count == 100
        assert skills[0].lines_of_code == 10000
        assert skills[0].proficiency_score > 0


class TestFrameworkDetection:
    """Test framework detection from dependency files."""

    def test_detect_fastapi_from_requirements(self):
        """Should detect FastAPI from requirements.txt."""
        analyzer = ProfileAnalyzer()
        file_contents = {
            "requirements.txt": "fastapi==0.109.0\nuvicorn[standard]>=0.27.0"
        }

        frameworks = analyzer.detect_frameworks(file_contents)

        framework_names = [f.name for f in frameworks]
        assert "FastAPI" in framework_names

    def test_detect_react_from_package_json(self):
        """Should detect React from package.json."""
        analyzer = ProfileAnalyzer()
        file_contents = {
            "package.json": '{"dependencies": {"react": "^18.0.0", "next": "^14.0.0"}}'
        }

        frameworks = analyzer.detect_frameworks(file_contents)

        framework_names = [f.name for f in frameworks]
        assert "React" in framework_names
        assert "Next.js" in framework_names

    def test_detect_django_from_pyproject(self):
        """Should detect Django from pyproject.toml."""
        analyzer = ProfileAnalyzer()
        file_contents = {
            "pyproject.toml": 'dependencies = ["django>=4.0", "djangorestframework"]'
        }

        frameworks = analyzer.detect_frameworks(file_contents)

        framework_names = [f.name for f in frameworks]
        assert "Django" in framework_names

    def test_detect_multiple_frameworks(self):
        """Should detect multiple frameworks from different files."""
        analyzer = ProfileAnalyzer()
        file_contents = {
            "requirements.txt": "sqlalchemy>=2.0\nredis>=4.0",
            "package.json": '{"dependencies": {"express": "^4.18.0"}}',
        }

        frameworks = analyzer.detect_frameworks(file_contents)

        framework_names = [f.name for f in frameworks]
        assert "SQLAlchemy" in framework_names
        assert "Redis" in framework_names
        assert "Express" in framework_names


class TestDomainDetection:
    """Test domain expertise detection."""

    def test_detect_payments_domain(self):
        """Should detect payments domain from PR content."""
        analyzer = ProfileAnalyzer()
        pr_titles = ["Add Stripe payment integration", "Fix billing calculation"]
        pr_descriptions = ["Implement checkout flow", "Handle subscription renewals"]
        commit_messages = ["Add payment processing", "Fix invoice generation"]

        domains = analyzer.detect_domains(pr_titles, pr_descriptions, commit_messages)

        domain_names = [d.name for d in domains]
        assert "payments" in domain_names

    def test_detect_auth_domain(self):
        """Should detect authentication domain."""
        analyzer = ProfileAnalyzer()
        pr_titles = ["Implement OAuth2 login", "Add JWT refresh"]
        pr_descriptions = ["SSO integration with Okta"]
        commit_messages = ["Add session management", "Fix auth middleware"]

        domains = analyzer.detect_domains(pr_titles, pr_descriptions, commit_messages)

        domain_names = [d.name for d in domains]
        assert "authentication" in domain_names

    def test_detect_data_pipeline_domain(self):
        """Should detect data pipeline domain."""
        analyzer = ProfileAnalyzer()
        pr_titles = ["Add ETL pipeline for analytics"]
        pr_descriptions = ["Airflow DAG for data processing", "Kafka consumer setup"]
        commit_messages = ["Add data warehouse integration"]

        domains = analyzer.detect_domains(pr_titles, pr_descriptions, commit_messages)

        domain_names = [d.name for d in domains]
        assert "data_pipeline" in domain_names

    def test_returns_top_5_domains(self):
        """Should return at most 5 domains."""
        analyzer = ProfileAnalyzer()
        # Create content with many domain keywords
        pr_titles = [
            "Add payment Stripe",
            "Fix auth OAuth",
            "ETL pipeline",
            "ML model training",
            "Docker kubernetes",
            "Security fix",
            "Frontend UI",
            "Backend API",
        ]

        domains = analyzer.detect_domains(pr_titles, [], [])

        assert len(domains) <= 5


class TestWorkPatternAnalysis:
    """Test work pattern analysis."""

    def test_analyze_work_patterns_detects_peak_hours(self, sample_commits_batch):
        """Should detect peak productivity hours from commits."""
        analyzer = ProfileAnalyzer()

        patterns = analyzer.analyze_work_patterns(sample_commits_batch, [])

        assert len(patterns.peak_productivity_hours) <= 3
        # Hours from sample data: 10, 14, 09, 16
        assert all(0 <= h <= 23 for h in patterns.peak_productivity_hours)

    def test_analyze_work_patterns_calculates_pr_size(self, sample_pull_requests_batch):
        """Should calculate average PR size."""
        analyzer = ProfileAnalyzer()

        patterns = analyzer.analyze_work_patterns([], sample_pull_requests_batch)

        assert patterns.average_pr_size > 0
        # Average of (350, 80, 500) = ~310
        assert patterns.average_pr_size > 200

    def test_determine_complexity_preference(self):
        """Should determine complexity preference based on PR size."""
        analyzer = ProfileAnalyzer()

        # Large PRs
        large_prs = [{"additions": 600, "deletions": 100}]
        patterns = analyzer.analyze_work_patterns([], large_prs)
        assert patterns.preferred_complexity == "complex"

        # Small PRs
        small_prs = [{"additions": 20, "deletions": 5}]
        patterns = analyzer.analyze_work_patterns([], small_prs)
        assert patterns.preferred_complexity == "simple"


class TestSkillFingerprintBuilding:
    """Test complete skill fingerprint building."""

    def test_build_skill_fingerprint(
        self,
        sample_commits_batch,
        sample_pull_requests_batch,
    ):
        """Should build complete skill fingerprint."""
        analyzer = ProfileAnalyzer()

        fingerprint = analyzer.build_skill_fingerprint(
            commits=sample_commits_batch,
            pull_requests=sample_pull_requests_batch,
        )

        assert len(fingerprint.languages) > 0
        assert len(fingerprint.domains) > 0
        # All scores should be valid
        for lang in fingerprint.languages:
            assert 0 <= lang.proficiency_score <= 100

    def test_build_skill_fingerprint_with_frameworks(
        self,
        sample_commits_batch,
        sample_pull_requests_batch,
    ):
        """Should include frameworks when file contents provided."""
        analyzer = ProfileAnalyzer()
        file_contents = {
            "requirements.txt": "fastapi>=0.109.0\npandas>=2.0"
        }

        fingerprint = analyzer.build_skill_fingerprint(
            commits=sample_commits_batch,
            pull_requests=sample_pull_requests_batch,
            file_contents=file_contents,
        )

        framework_names = [f.name for f in fingerprint.frameworks]
        assert "FastAPI" in framework_names
        assert "Pandas" in framework_names


class TestGrowthTrajectory:
    """Test growth trajectory analysis."""

    def test_build_growth_trajectory_detects_new_skills(self):
        """Should detect newly acquired skills."""
        analyzer = ProfileAnalyzer()
        from aexy.schemas.developer import LanguageSkill

        recent = [
            LanguageSkill(name="Python", proficiency_score=80, lines_of_code=5000, commits_count=50),
            LanguageSkill(name="Go", proficiency_score=40, lines_of_code=1000, commits_count=10),
        ]
        historical = [
            LanguageSkill(name="Python", proficiency_score=60, lines_of_code=3000, commits_count=30),
        ]

        trajectory = analyzer.build_growth_trajectory(recent, historical)

        assert "Go" in trajectory.skills_acquired_6m

    def test_build_growth_trajectory_detects_declining_skills(self):
        """Should detect declining skills."""
        analyzer = ProfileAnalyzer()
        from aexy.schemas.developer import LanguageSkill

        recent = [
            LanguageSkill(name="Python", proficiency_score=80, lines_of_code=5000, commits_count=50),
        ]
        historical = [
            LanguageSkill(name="Python", proficiency_score=60, lines_of_code=3000, commits_count=30),
            LanguageSkill(name="Ruby", proficiency_score=50, lines_of_code=2000, commits_count=20),
        ]

        trajectory = analyzer.build_growth_trajectory(recent, historical)

        assert "Ruby" in trajectory.skills_declining
