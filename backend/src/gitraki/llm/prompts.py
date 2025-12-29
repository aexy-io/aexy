"""Prompt templates for LLM analysis."""

CODE_ANALYSIS_SYSTEM_PROMPT = """You are an expert code analyst. Analyze code to extract:
1. Programming languages and proficiency indicators
2. Frameworks and libraries with usage depth
3. Domain expertise signals (payments, auth, ML, etc.)
4. Code quality indicators

Respond ONLY with valid JSON matching the schema provided. No explanations outside JSON."""

CODE_ANALYSIS_PROMPT = """Analyze the following code and extract technical insights.

File path: {file_path}
Language hint: {language_hint}

Code:
```
{code}
```

Respond with JSON matching this schema:
{{
  "languages": [
    {{
      "name": "string (language name)",
      "proficiency_indicators": ["list of observed proficiency signals"],
      "patterns_detected": ["design patterns, idioms used"],
      "confidence": 0.0-1.0
    }}
  ],
  "frameworks": [
    {{
      "name": "string (framework/library name)",
      "category": "web|database|testing|ml|devops|other",
      "usage_depth": "basic|intermediate|advanced",
      "patterns_detected": ["specific patterns used"],
      "confidence": 0.0-1.0
    }}
  ],
  "domains": [
    {{
      "name": "payments|authentication|data_pipeline|ml_infrastructure|mobile|devops|security|frontend|backend|other",
      "indicators": ["specific indicators found"],
      "confidence": 0.0-1.0
    }}
  ],
  "code_quality": {{
    "complexity": "low|moderate|high",
    "test_coverage_indicators": ["indicators of testing"],
    "documentation_quality": "poor|moderate|good|excellent",
    "best_practices": ["observed best practices"],
    "concerns": ["potential issues or anti-patterns"]
  }},
  "summary": "Brief summary of the code's purpose and quality"
}}"""

COMMIT_MESSAGE_ANALYSIS_PROMPT = """Analyze the following commit message to understand developer patterns.

Commit message:
```
{message}
```

Files changed: {files_changed}
Additions: {additions}
Deletions: {deletions}

Respond with JSON:
{{
  "domains": [
    {{
      "name": "domain area this touches",
      "indicators": ["why you identified this domain"],
      "confidence": 0.0-1.0
    }}
  ],
  "soft_skills": [
    {{
      "skill": "communication",
      "score": 0.0-1.0,
      "indicators": ["clarity, descriptiveness of message"]
    }}
  ],
  "summary": "What this commit accomplishes"
}}"""

PR_ANALYSIS_SYSTEM_PROMPT = """You are an expert at analyzing pull request descriptions to understand developer skills and communication patterns.
Extract technical skills, soft skills indicators, and domain expertise from PR content.
Respond ONLY with valid JSON."""

PR_DESCRIPTION_ANALYSIS_PROMPT = """Analyze this pull request to extract skills and soft skills indicators.

Title: {title}
Description:
```
{description}
```

Files changed: {files_changed}
Additions: {additions}
Deletions: {deletions}

Respond with JSON:
{{
  "domains": [
    {{
      "name": "string",
      "indicators": ["list"],
      "confidence": 0.0-1.0
    }}
  ],
  "soft_skills": [
    {{
      "skill": "communication|mentorship|collaboration|leadership",
      "score": 0.0-1.0,
      "indicators": ["specific observations"]
    }}
  ],
  "code_quality": {{
    "complexity": "low|moderate|high",
    "documentation_quality": "poor|moderate|good|excellent",
    "best_practices": ["observed"],
    "concerns": ["potential issues"]
  }},
  "summary": "What this PR accomplishes and its quality"
}}"""

REVIEW_COMMENT_ANALYSIS_PROMPT = """Analyze this code review comment for soft skills indicators.

Review state: {state}
Comment:
```
{comment}
```

Respond with JSON:
{{
  "soft_skills": [
    {{
      "skill": "communication|mentorship|collaboration|leadership",
      "score": 0.0-1.0,
      "indicators": ["specific observations"]
    }}
  ],
  "review_quality": {{
    "constructiveness": 0.0-1.0,
    "technical_depth": 0.0-1.0,
    "mentorship_indicators": ["teaching moments, explanations"],
    "tone": "supportive|neutral|critical"
  }},
  "summary": "Assessment of review quality and style"
}}"""

TASK_SIGNALS_SYSTEM_PROMPT = """You are an expert at analyzing task descriptions to extract required skills and complexity.
Identify programming languages, frameworks, domains, and estimate complexity.
Respond ONLY with valid JSON."""

TASK_SIGNALS_PROMPT = """Analyze this task/issue description to extract skill requirements.

Source: {source}
Title: {title}
Description:
```
{description}
```

Labels: {labels}

Respond with JSON:
{{
  "required_skills": ["skills absolutely needed"],
  "preferred_skills": ["nice-to-have skills"],
  "domain": "primary domain this touches",
  "complexity": "low|medium|high",
  "estimated_effort": "hours|days|weeks",
  "keywords": ["key technical terms"],
  "confidence": 0.0-1.0
}}"""

MATCH_SCORING_SYSTEM_PROMPT = """You are an expert at matching developers to tasks based on skills.
Evaluate how well a developer's skills match task requirements.
Consider skill overlap, growth opportunities, and potential gaps.
Respond ONLY with valid JSON."""

MATCH_SCORING_PROMPT = """Score how well this developer matches the task.

Task Requirements:
- Required skills: {required_skills}
- Preferred skills: {preferred_skills}
- Domain: {domain}
- Complexity: {complexity}

Developer Profile:
- Languages: {languages}
- Frameworks: {frameworks}
- Domains: {developer_domains}
- Recent activity: {recent_activity}

Respond with JSON:
{{
  "overall_score": 0-100,
  "skill_match": 0-100,
  "experience_match": 0-100,
  "growth_opportunity": 0-100,
  "reasoning": "explanation of the score",
  "strengths": ["what makes this developer a good fit"],
  "gaps": ["skills or experience the developer lacks"]
}}"""
