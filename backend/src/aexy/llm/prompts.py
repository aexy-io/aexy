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


# ============================================================================
# Phase 3: Career Intelligence Prompts
# ============================================================================

LEARNING_PATH_SYSTEM_PROMPT = """You are an expert career development advisor for software engineers.
Generate personalized learning paths based on current skills, target role requirements, and industry best practices.
Consider realistic timelines and progressive skill building.
Respond ONLY with valid JSON."""

LEARNING_PATH_PROMPT = """Generate a personalized learning path for a developer.

Current Skills:
{current_skills}

Target Role: {target_role}
Target Role Requirements: {role_requirements}

Skill Gaps:
{skill_gaps}

Timeline: {timeline_months} months
Include External Resources: {include_external}

Generate a structured learning path with:
1. Phases (Foundation, Application, Demonstration)
2. For each phase:
   - Duration in weeks
   - Skills to develop
   - Specific activities (internal tasks, pairing, reviews)
   - External resources (courses, books) if enabled
3. Milestones with target dates and success criteria
4. Risk factors and mitigation strategies

Respond with JSON:
{{
  "phases": [
    {{
      "name": "Phase name",
      "duration_weeks": 4-12,
      "skills": ["skills to develop"],
      "activities": [
        {{
          "type": "task|pairing|review|course|book|project",
          "description": "what to do",
          "source": "internal|coursera|udemy|etc",
          "url": "optional URL",
          "estimated_hours": 10
        }}
      ]
    }}
  ],
  "milestones": [
    {{
      "skill_name": "skill",
      "target_score": 60,
      "week": 4,
      "success_criteria": ["how to measure success"],
      "activities": ["recommended activities for this milestone"]
    }}
  ],
  "estimated_success_probability": 0.0-1.0,
  "risk_factors": ["potential blockers or challenges"],
  "recommendations": ["actionable advice"]
}}"""

MILESTONE_EVALUATION_PROMPT = """Evaluate milestone progress for a learning path.

Milestone: {skill_name}
Target Score: {target_score}
Current Score: {current_score}
Target Date: {target_date}

Recent Activity:
{recent_activity}

Evaluate progress and provide updated recommendations.

Respond with JSON:
{{
  "status": "not_started|in_progress|completed|behind",
  "progress_percentage": 0-100,
  "assessment": "brief assessment of progress",
  "updated_activities": [
    {{
      "type": "task|pairing|review|course",
      "description": "recommended next step",
      "priority": "high|medium|low"
    }}
  ],
  "trajectory": "on_track|ahead|behind|at_risk",
  "recommendations": ["specific advice"]
}}"""

JOB_DESCRIPTION_SYSTEM_PROMPT = """You are an expert technical recruiter and job description writer with extensive experience in the software industry.
Generate compelling, comprehensive, and professional job descriptions that attract top talent.
Base requirements on the role title and level, industry best practices, and any team context provided.
Always produce detailed, actionable job descriptions with specific technical requirements.
Respond ONLY with valid JSON."""

JOB_DESCRIPTION_PROMPT = """Generate a comprehensive job description for the following role.

Role Information:
- Title: {role_title}
- Level: {level}
- Hiring Priority: {priority}

Team Context (if available):
- Team size: {team_size}
- Critical skill gaps identified: {critical_skills}
- Bus factor risks: {bus_factor_risks}

Roadmap/Project Context:
{roadmap_context}

Role Template Reference (if any):
{role_template}

IMPORTANT: Generate a detailed, professional job description suitable for posting on job boards.
Even if team context is limited, use your expertise to create comprehensive requirements based on:
1. The role title and level
2. Industry standards for similar positions
3. Common technical stacks and skills for this type of role
4. Best practices for the role level (Junior/Mid/Senior/Staff/Principal)

For a {level} {role_title}, include:
- 5-8 must-have technical skills with proficiency levels
- 3-5 nice-to-have skills
- 6-8 specific responsibilities
- 5-7 qualifications
- Team culture and work style expectations

Respond with JSON:
{{
  "role_title": "Finalized professional title",
  "level": "{level}",
  "summary": "Compelling 2-3 sentence role summary that excites candidates",
  "must_have_skills": [
    {{
      "skill": "specific technology or skill",
      "level": 60-100,
      "reasoning": "why this is essential for the role"
    }}
  ],
  "nice_to_have_skills": [
    {{
      "skill": "specific technology or skill",
      "level": 40-70,
      "reasoning": "how this adds value"
    }}
  ],
  "responsibilities": ["specific, actionable responsibilities"],
  "qualifications": ["years of experience, education, certifications"],
  "cultural_indicators": ["team culture and work environment aspects"],
  "full_text": "Complete, professionally formatted job description in markdown with sections: About the Role, What You'll Do, What We're Looking For, Nice to Have, Why Join Us"
}}"""

INTERVIEW_RUBRIC_SYSTEM_PROMPT = """You are an expert technical interviewer with experience at top tech companies.
Generate comprehensive, structured interview rubrics that effectively assess both technical depth and cultural fit.
Create questions that reveal true competency levels and thinking patterns.
Include specific evaluation criteria, red flags, and indicators of exceptional candidates.
Respond ONLY with valid JSON."""

INTERVIEW_RUBRIC_PROMPT = """Generate a comprehensive interview rubric for evaluating candidates.

Role Details:
- Position: {role_title}
- Level: {level}
- Required Skills: {required_skills}
- Nice-to-have Skills: {nice_to_have_skills}

Team Context:
- Tech Stack: {tech_stack}
- Domain Focus: {team_domains}
- Work Style: {work_style}

Generate a thorough interview rubric including:

TECHNICAL ASSESSMENT:
- Create 6-10 technical questions covering the required skills
- Include a mix of difficulty levels (easy, medium, hard)
- Questions should assess both knowledge and practical application
- Include coding/problem-solving questions appropriate for the level

BEHAVIORAL ASSESSMENT:
- Create 4-6 behavioral questions using the STAR method
- Cover: collaboration, conflict resolution, leadership (for senior roles), growth mindset
- Include questions about past technical decisions and trade-offs

SYSTEM DESIGN (for Mid+ levels):
- Create a relevant system design prompt
- Should match the role's domain and complexity expectations

For each question include:
- Specific evaluation criteria (what separates good from great)
- Red flags that indicate the candidate may not be a fit
- Bonus indicators that suggest exceptional capability

Respond with JSON:
{{
  "role_title": "{role_title}",
  "technical_questions": [
    {{
      "question": "detailed technical question",
      "skill_assessed": "specific skill being tested",
      "difficulty": "easy|medium|hard",
      "evaluation_criteria": ["specific things to look for in answers", "expected depth of knowledge"],
      "red_flags": ["warning signs in responses", "concerning patterns"],
      "bonus_indicators": ["signs of exceptional skill", "advanced understanding"]
    }}
  ],
  "behavioral_questions": [
    {{
      "question": "Tell me about a time when... (STAR format)",
      "skill_assessed": "communication|collaboration|leadership|mentorship|problem_solving",
      "difficulty": "medium",
      "evaluation_criteria": ["clear situation description", "specific actions taken", "measurable results"],
      "red_flags": ["vague answers", "blaming others", "no concrete examples"],
      "bonus_indicators": ["self-awareness", "growth from experience", "team impact"]
    }}
  ],
  "system_design_prompt": "Design a [relevant system] that handles [specific requirements]. Consider scalability, reliability, and maintainability. Walk through your high-level architecture, data model, and key technical decisions.",
  "culture_fit_criteria": ["specific traits that indicate good cultural fit", "values alignment indicators"]
}}"""

STRETCH_ASSIGNMENT_PROMPT = """Identify stretch assignments for a developer based on their learning path.

Developer Current Skills:
{current_skills}

Learning Path Goals:
{learning_goals}

Target Skills to Develop:
{target_skills}

Available Tasks:
{available_tasks}

Identify tasks that would help the developer grow while being achievable with some stretch.

Respond with JSON:
{{
  "recommendations": [
    {{
      "task_id": "task identifier",
      "task_title": "task title",
      "alignment_score": 0.0-1.0,
      "skill_growth": ["skills this would develop"],
      "challenge_level": "moderate|high|stretch",
      "reasoning": "why this is a good stretch assignment",
      "support_needed": ["mentoring or pairing suggestions"]
    }}
  ]
}}"""

ROADMAP_SKILL_EXTRACTION_PROMPT = """Extract skill requirements from roadmap/epic items.

Roadmap Items:
{roadmap_items}

For each item, identify:
1. Required technical skills
2. Domain expertise needed
3. Estimated complexity and team size

Respond with JSON:
{{
  "skill_requirements": [
    {{
      "skill": "skill name",
      "priority": "critical|high|medium|low",
      "source_items": ["epic/story IDs that need this"],
      "estimated_demand": 1-5
    }}
  ],
  "domain_requirements": [
    {{
      "domain": "domain area",
      "items_affected": ["epic/story IDs"],
      "expertise_level_needed": "basic|intermediate|expert"
    }}
  ],
  "summary": "Overall skill landscape summary",
  "hiring_implications": ["implications for hiring strategy"]
}}"""

# Phase 4: Predictive Analytics Prompts

ATTRITION_RISK_SYSTEM_PROMPT = """You are an expert organizational psychologist analyzing developer engagement patterns.
Identify potential attrition risks based on activity patterns, collaboration changes, and behavioral signals.
Be balanced - consider both risk factors and positive signals.
Respond ONLY with valid JSON."""

ATTRITION_RISK_PROMPT = """Analyze the following developer's activity patterns for attrition risk indicators.

Developer Profile:
- Name: {developer_name}
- Tenure: {tenure}
- Current Skills: {skills}
- Role Level: {role_level}

Activity Trends (last 90 days vs previous 90 days):
- Commit frequency: {commit_trend}
- PR submission rate: {pr_trend}
- Code review participation: {review_trend}
- Work hours distribution: {hours_pattern}
- Collaboration changes: {collab_changes}

Historical Baseline:
{baseline_metrics}

Work Patterns:
- Preferred complexity: {preferred_complexity}
- Collaboration style: {collaboration_style}
- Peak productivity hours: {peak_hours}

Analyze for risk factors such as:
1. Declining activity (gradual disengagement)
2. Changed work patterns (burnout indicators)
3. Reduced collaboration (isolation)
4. Scope changes (being sidelined)
5. Quality changes (reduced investment)

Respond with JSON:
{{
  "risk_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "risk_level": "low|moderate|high|critical",
  "factors": [
    {{
      "factor": "factor name",
      "weight": 0.0-1.0,
      "evidence": "specific evidence",
      "trend": "improving|stable|declining"
    }}
  ],
  "positive_signals": ["observed positive indicators"],
  "recommendations": ["management recommendations"],
  "suggested_actions": ["specific actions to take"]
}}"""

BURNOUT_RISK_SYSTEM_PROMPT = """You are an expert in developer wellness and burnout prevention.
Analyze work patterns to identify potential burnout risks before they become critical.
Focus on sustainable work practices and work-life balance indicators.
Respond ONLY with valid JSON."""

BURNOUT_RISK_PROMPT = """Assess burnout risk for this developer based on recent activity patterns.

Developer: {developer_name}
Recent Period: Last {days} days

Activity Patterns:
- Average daily commits: {avg_daily_commits}
- Weekend work percentage: {weekend_work_pct}
- After-hours work percentage: {after_hours_pct}
- Longest work streak (days without break): {longest_streak}
- Average PR size: {avg_pr_size}
- Review turnaround time: {review_turnaround}

Workload Indicators:
- Active PRs: {active_prs}
- Pending reviews: {pending_reviews}
- Recent sprint velocity: {velocity}

Historical Comparison:
- Current vs 3-month average activity: {activity_change}
- Collaboration pattern changes: {collab_changes}

Assess for burnout indicators:
1. Overwork patterns (extended hours, weekends)
2. Quality decline indicators
3. Response time changes
4. Scope changes
5. Communication pattern shifts

Respond with JSON:
{{
  "risk_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "risk_level": "low|moderate|high|critical",
  "indicators": ["observed burnout indicators"],
  "factors": [
    {{
      "factor": "factor name",
      "weight": 0.0-1.0,
      "evidence": "specific evidence",
      "trend": "improving|stable|declining"
    }}
  ],
  "recommendations": ["wellness recommendations"],
  "immediate_actions": ["urgent actions if needed"]
}}"""

PERFORMANCE_TRAJECTORY_SYSTEM_PROMPT = """You are an expert in developer career growth and performance prediction.
Analyze historical growth patterns to predict future performance trajectory.
Consider learning velocity, skill acquisition, and career progression indicators.
Respond ONLY with valid JSON."""

PERFORMANCE_TRAJECTORY_PROMPT = """Predict the performance trajectory for this developer over the next {months} months.

Developer Profile:
- Name: {developer_name}
- Current Level: {current_level}
- Tenure: {tenure}
- Primary Skills: {primary_skills}

Growth History (last 12 months):
- Skills acquired: {skills_acquired}
- Learning velocity: {learning_velocity} new skills/quarter
- Complexity progression: {complexity_trend}
- Domain expansion: {domain_growth}

Current Learning Path:
{learning_path}

Recent Performance:
- Code quality trend: {code_quality_trend}
- Review quality: {review_quality}
- Mentoring activity: {mentoring_activity}
- Project impact: {project_impact}

Team Context:
- Team size: {team_size}
- Skill gaps developer could fill: {potential_growth_areas}

Predict:
1. Expected skill growth areas
2. Potential plateaus or challenges
3. Readiness for next career level
4. Recommended focus areas

Respond with JSON:
{{
  "trajectory": "accelerating|steady|plateauing|declining",
  "confidence": 0.0-1.0,
  "predicted_growth": [
    {{
      "skill": "skill name",
      "current": 0-100,
      "predicted": 0-100,
      "timeline": "3 months|6 months|12 months"
    }}
  ],
  "challenges": ["potential challenges"],
  "opportunities": ["growth opportunities"],
  "career_readiness": {{
    "next_level": "next career level",
    "readiness_score": 0.0-1.0,
    "blockers": ["what's blocking progression"],
    "accelerators": ["what could speed up progression"]
  }},
  "recommendations": ["specific development recommendations"]
}}"""

TEAM_HEALTH_SYSTEM_PROMPT = """You are an expert in engineering team dynamics and organizational health.
Assess overall team health based on collaboration patterns, skill coverage, and sustainability metrics.
Provide actionable insights for team improvement.
Respond ONLY with valid JSON."""

TEAM_HEALTH_PROMPT = """Assess the overall health of this engineering team.

Team Composition:
- Size: {team_size}
- Members: {team_members}
- Average tenure: {avg_tenure}
- Seniority distribution: {seniority_dist}

Skill Coverage:
{skill_coverage}

Bus Factor Risks:
{bus_factors}

Workload Distribution:
{workload_dist}

Collaboration Patterns:
{collab_patterns}

Recent Trends (30 days):
- Velocity trend: {velocity_trend}
- Quality trend: {quality_trend}
- Collaboration density: {collab_density}

Historical Context:
- Recent departures: {recent_departures}
- New joiners: {new_joiners}

Assess:
1. Overall team health score
2. Key strengths
3. Critical risks
4. Capacity concerns
5. Culture/collaboration indicators

Respond with JSON:
{{
  "health_score": 0.0-1.0,
  "health_grade": "A|B|C|D|F",
  "strengths": ["team strengths"],
  "risks": [
    {{
      "risk": "risk description",
      "severity": "low|medium|high",
      "mitigation": "recommended mitigation"
    }}
  ],
  "capacity_assessment": {{
    "current_utilization": 0.0-1.0,
    "sustainable_velocity": true|false,
    "bottlenecks": ["identified bottlenecks"]
  }},
  "collaboration_health": {{
    "score": 0.0-1.0,
    "patterns": ["observed patterns"],
    "improvements": ["suggestions"]
  }},
  "recommendations": ["team improvement recommendations"],
  "suggested_hires": ["skills to hire for"]
}}"""


# ============================================================================
# Phase 5: Documentation Generation Prompts
# ============================================================================

DOC_GENERATION_SYSTEM_PROMPT = """You are an expert technical documentation writer.
Generate clear, comprehensive, and well-structured documentation from source code.
Use proper formatting, include examples where helpful, and ensure documentation is accurate and up-to-date.
Always respond with valid JSON that can be converted to TipTap editor format."""

DOC_API_SYSTEM_PROMPT = """You are an expert API documentation writer.
Generate comprehensive API documentation including endpoints, parameters, response formats, and examples.
Follow industry best practices for API documentation (similar to Stripe, Twilio docs).
Always respond with valid JSON in TipTap-compatible format."""

DOC_API_PROMPT = """Generate comprehensive API documentation for the following code.

File path: {file_path}
Language: {language}

Source code:
```{language}
{code}
```

Additional context:
{context}

Generate API documentation including:
1. Overview and purpose
2. Authentication requirements (if detected)
3. Base URL patterns
4. For each endpoint/function:
   - HTTP method and path
   - Description
   - Request parameters (path, query, body)
   - Response format with examples
   - Error codes and handling
5. Code examples in multiple languages if applicable

Respond with JSON in TipTap document format:
{{
  "type": "doc",
  "content": [
    {{
      "type": "heading",
      "attrs": {{"level": 1}},
      "content": [{{"type": "text", "text": "API title"}}]
    }},
    {{
      "type": "paragraph",
      "content": [{{"type": "text", "text": "Description"}}]
    }},
    {{
      "type": "heading",
      "attrs": {{"level": 2}},
      "content": [{{"type": "text", "text": "Endpoints"}}]
    }},
    // ... more content
  ],
  "metadata": {{
    "endpoints_count": 0,
    "methods": ["GET", "POST"],
    "has_auth": true
  }}
}}"""

DOC_README_SYSTEM_PROMPT = """You are an expert technical writer creating project README files.
Generate clear, welcoming, and comprehensive README documentation.
Include all essential sections that help developers get started quickly.
Always respond with valid JSON in TipTap-compatible format."""

DOC_README_PROMPT = """Generate a comprehensive README for this project/module.

Repository/Module: {name}
Path: {path}

Source files:
{files_summary}

Package configuration (if available):
{package_config}

Dependencies:
{dependencies}

Generate a README including:
1. Project title and badges
2. Brief description and purpose
3. Features/highlights
4. Installation instructions
5. Quick start / Usage examples
6. Configuration options
7. API reference (brief)
8. Contributing guidelines
9. License information

Respond with JSON in TipTap document format:
{{
  "type": "doc",
  "content": [
    {{
      "type": "heading",
      "attrs": {{"level": 1}},
      "content": [{{"type": "text", "text": "Project Name"}}]
    }},
    {{
      "type": "paragraph",
      "content": [{{"type": "text", "text": "Brief description"}}]
    }},
    // ... more sections
  ],
  "metadata": {{
    "has_installation": true,
    "has_examples": true,
    "languages": ["python", "typescript"]
  }}
}}"""

DOC_FUNCTION_SYSTEM_PROMPT = """You are an expert at documenting functions, methods, and classes.
Generate detailed documentation with clear explanations, parameter descriptions, and usage examples.
Always respond with valid JSON in TipTap-compatible format."""

DOC_FUNCTION_PROMPT = """Generate detailed documentation for this function/method/class.

File path: {file_path}
Language: {language}

Code:
```{language}
{code}
```

Context (surrounding code or related functions):
{context}

Generate documentation including:
1. Name and signature
2. Brief description (one line)
3. Detailed description
4. Parameters with types and descriptions
5. Return value description
6. Exceptions/errors that can be raised
7. Usage examples (at least 2)
8. Related functions/methods
9. Notes or caveats

Respond with JSON in TipTap document format:
{{
  "type": "doc",
  "content": [
    {{
      "type": "heading",
      "attrs": {{"level": 1}},
      "content": [{{"type": "text", "text": "function_name"}}]
    }},
    {{
      "type": "codeBlock",
      "attrs": {{"language": "{language}"}},
      "content": [{{"type": "text", "text": "function signature"}}]
    }},
    // ... parameters, examples, etc.
  ],
  "metadata": {{
    "function_name": "name",
    "parameters_count": 0,
    "has_return": true,
    "complexity": "low|medium|high"
  }}
}}"""

DOC_MODULE_SYSTEM_PROMPT = """You are an expert at documenting software modules and packages.
Generate comprehensive module documentation that helps developers understand architecture and usage.
Always respond with valid JSON in TipTap-compatible format."""

DOC_MODULE_PROMPT = """Generate comprehensive documentation for this module/directory.

Module path: {path}
Language: {language}

Files in module:
{files_list}

Key file contents:
{key_files}

Dependencies/imports:
{dependencies}

Generate module documentation including:
1. Module overview and purpose
2. Architecture overview
3. Key components and their responsibilities
4. Public API summary
5. Usage patterns and examples
6. Configuration options
7. Integration with other modules
8. Best practices

Respond with JSON in TipTap document format:
{{
  "type": "doc",
  "content": [
    {{
      "type": "heading",
      "attrs": {{"level": 1}},
      "content": [{{"type": "text", "text": "Module Name"}}]
    }},
    {{
      "type": "paragraph",
      "content": [{{"type": "text", "text": "Overview"}}]
    }},
    // ... architecture, components, etc.
  ],
  "metadata": {{
    "files_count": 0,
    "exports_count": 0,
    "has_tests": true,
    "complexity": "low|medium|high"
  }}
}}"""

DOC_UPDATE_SYSTEM_PROMPT = """You are an expert at maintaining and updating technical documentation.
Analyze existing documentation against current code and suggest intelligent updates.
Preserve existing structure and style while incorporating new information.
Always respond with valid JSON in TipTap-compatible format."""

DOC_UPDATE_PROMPT = """Update the existing documentation based on code changes.

Existing documentation:
{existing_doc}

Previous code version:
```{language}
{old_code}
```

Current code version:
```{language}
{new_code}
```

Changes detected:
{changes_summary}

Update the documentation to:
1. Reflect all code changes accurately
2. Preserve existing style and structure
3. Update examples if function signatures changed
4. Add documentation for new features
5. Mark deprecated features if applicable
6. Update version/changelog if present

Respond with JSON containing:
{{
  "updated_doc": {{
    "type": "doc",
    "content": [/* TipTap content */]
  }},
  "changes_made": [
    {{
      "section": "section name",
      "change_type": "added|updated|removed|deprecated",
      "description": "what changed"
    }}
  ],
  "suggestions": ["additional improvements to consider"],
  "confidence": 0.0-1.0
}}"""

DOC_IMPROVEMENT_SYSTEM_PROMPT = """You are an expert technical documentation reviewer.
Analyze documentation quality and suggest specific improvements.
Focus on clarity, completeness, accuracy, and developer experience.
Always respond with valid JSON."""

DOC_IMPROVEMENT_PROMPT = """Analyze this documentation and suggest improvements.

Documentation:
{documentation}

Related source code (if available):
```{language}
{code}
```

Documentation category: {category}

Analyze for:
1. Completeness - missing sections or information
2. Clarity - confusing or unclear explanations
3. Accuracy - outdated or incorrect information
4. Examples - missing or poor code examples
5. Structure - organization and navigation
6. SEO/Discoverability - titles, descriptions

Respond with JSON:
{{
  "quality_score": 0-100,
  "improvements": [
    {{
      "priority": "critical|high|medium|low",
      "section": "section name or location",
      "issue": "what's wrong",
      "suggestion": "how to fix it",
      "example": "optional improved text"
    }}
  ],
  "missing_sections": ["sections that should be added"],
  "outdated_content": ["content that appears outdated"],
  "strengths": ["what the documentation does well"],
  "overall_assessment": "summary of documentation quality"
}}"""


# ============================================================================
# Phase 6: Assessment & Hiring Platform Prompts
# ============================================================================

TOPIC_SUGGESTION_SYSTEM_PROMPT = """You are an expert technical interviewer and assessment designer.
Based on the job role, skills, and experience level, suggest relevant assessment topics.
Focus on practical, job-relevant topics that differentiate candidate abilities.
Respond ONLY with valid JSON."""

TOPIC_SUGGESTION_PROMPT = """Suggest assessment topics for evaluating candidates for this role.

Job Designation: {job_designation}
Required Skills: {skills}
Experience Level: {experience_level}
Number of topics to suggest: {count}

For each topic, consider:
1. Relevance to the job role
2. Ability to differentiate candidate skill levels
3. Practical application in real work
4. Coverage of both theoretical knowledge and practical skills

Respond with JSON:
{{
  "topics": [
    {{
      "name": "Topic name",
      "description": "Brief description of what this topic covers",
      "subtopics": ["subtopic1", "subtopic2", "subtopic3"],
      "question_types": ["mcq", "code", "subjective"],
      "difficulty_distribution": {{"easy": 30, "medium": 50, "hard": 20}},
      "question_count": 5,
      "duration_minutes": 10,
      "relevance_to_role": "How this topic is relevant to the job"
    }}
  ],
  "coverage_summary": "How these topics provide comprehensive assessment coverage"
}}"""

CODE_QUESTION_SYSTEM_PROMPT = """You are an expert at creating coding assessment questions.
Create practical, well-structured coding problems that test real-world programming skills.
Include clear problem statements, test cases, and evaluation criteria.
Respond ONLY with valid JSON."""

CODE_QUESTION_PROMPT = """Generate a coding question for technical assessment.

Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}
Programming Language(s): {languages}
Time Limit: {time_limit} minutes
Experience Level: {experience_level}

Create a coding question that:
1. Tests practical programming skills
2. Has clear, unambiguous requirements
3. Can be completed within the time limit
4. Has comprehensive test cases
5. Allows for multiple valid solutions

Respond with JSON:
{{
  "question": {{
    "title": "Question title",
    "problem_statement": "Detailed problem description in markdown",
    "input_format": "Description of input format",
    "output_format": "Description of expected output",
    "constraints": ["constraint 1", "constraint 2"],
    "examples": [
      {{
        "input": "example input",
        "output": "expected output",
        "explanation": "why this is the answer"
      }}
    ],
    "starter_code": {{
      "python": "def solution(input):\\n    # Your code here\\n    pass",
      "javascript": "function solution(input) {{\\n  // Your code here\\n}}",
      "java": "public class Solution {{\\n    public static void main(String[] args) {{\\n        // Your code here\\n    }}\\n}}"
    }},
    "test_cases": [
      {{
        "input": "test input",
        "expected_output": "expected output",
        "is_hidden": false,
        "points": 10
      }}
    ],
    "total_points": 100,
    "time_complexity_hint": "O(n)",
    "space_complexity_hint": "O(1)",
    "hints": ["hint 1 if stuck", "hint 2 for further help"],
    "tags": ["arrays", "strings", "algorithms"],
    "difficulty_justification": "Why this question is at this difficulty level"
  }}
}}"""

MCQ_QUESTION_SYSTEM_PROMPT = """You are an expert at creating multiple choice questions for technical assessments.
Create questions that test conceptual understanding with well-crafted distractors.
Ensure questions are unambiguous with exactly one correct answer (unless multiple-select).
Respond ONLY with valid JSON."""

MCQ_QUESTION_PROMPT = """Generate a multiple choice question for technical assessment.

Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}
Experience Level: {experience_level}

Create an MCQ that:
1. Tests understanding, not just memorization
2. Has plausible but clearly wrong distractors
3. Has one unambiguous correct answer
4. Avoids "all of the above" or "none of the above"
5. Tests practical knowledge relevant to real work

Respond with JSON:
{{
  "question": {{
    "title": "Short descriptive title (3-6 words, e.g., 'Python List Type Check')",
    "question_text": "The question text in markdown",
    "question_type": "single_choice",
    "options": [
      {{
        "id": "A",
        "text": "Option text",
        "is_correct": true,
        "explanation": "Why this is correct/incorrect"
      }},
      {{
        "id": "B",
        "text": "Option text",
        "is_correct": false,
        "explanation": "Why this is incorrect"
      }},
      {{
        "id": "C",
        "text": "Option text",
        "is_correct": false,
        "explanation": "Why this is incorrect"
      }},
      {{
        "id": "D",
        "text": "Option text",
        "is_correct": false,
        "explanation": "Why this is incorrect"
      }}
    ],
    "correct_answer": "A",
    "explanation": "Detailed explanation of the correct answer",
    "points": 10,
    "time_estimate_seconds": 60,
    "tags": ["concept", "practical"],
    "common_misconception": "What misconception this question tests"
  }}
}}

IMPORTANT: The "title" field must be a SHORT descriptive name (3-6 words), NOT the full question text.
Good example: "Python List Type Check"
Bad example: "What is the output of print(type([]) is list)"
"""

MCQ_BATCH_QUESTION_SYSTEM_PROMPT = """You are an expert at creating multiple choice questions for technical assessments.
Create diverse questions that test conceptual understanding with well-crafted distractors.
Ensure questions are unambiguous with exactly one correct answer.
Generate MULTIPLE unique questions covering different aspects of the topic.
Tailor questions to the specific job role, required skills, and experience level.
Respond ONLY with valid JSON."""

MCQ_BATCH_QUESTION_PROMPT = """Generate {count} multiple choice questions for a technical assessment.

=== ASSESSMENT CONTEXT ===
Job Role: {job_designation}
Required Skills: {skills}
Experience Level: {experience_level} ({experience_years})
Organization: {organization_name}
Assessment Description: {assessment_description}

=== TOPIC DETAILS ===
Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}

=== ADDITIONAL CONTEXT ===
{context}

Create {count} UNIQUE MCQs that:
1. Are directly relevant to the job role and required skills
2. Match the expected experience level (junior=basics, mid=application, senior=advanced concepts)
3. Cover different aspects of the topic and subtopics
4. Test understanding, not just memorization
5. Have plausible but clearly wrong distractors
6. Have one unambiguous correct answer each
7. Avoid "all of the above" or "none of the above"
8. Test practical knowledge relevant to real work scenarios
9. Are diverse - don't repeat similar questions

Respond with JSON:
{{
  "questions": [
    {{
      "title": "Short descriptive title (3-6 words)",
      "problem_statement": "The question text in markdown",
      "options": [
        {{"id": "A", "text": "Option text", "is_correct": true}},
        {{"id": "B", "text": "Option text", "is_correct": false}},
        {{"id": "C", "text": "Option text", "is_correct": false}},
        {{"id": "D", "text": "Option text", "is_correct": false}}
      ],
      "explanation": "Brief explanation of correct answer",
      "max_marks": 10,
      "time_estimate_minutes": 2
    }}
  ]
}}

IMPORTANT:
- Generate exactly {count} questions
- Each "title" must be SHORT (3-6 words), NOT the full question
- Questions should reflect real scenarios a {job_designation} would encounter
- Difficulty should match: {difficulty} level for {experience_level} candidates
- Cover different subtopics if provided"""

CODE_BATCH_QUESTION_SYSTEM_PROMPT = """You are an expert at creating coding assessment questions.
Create practical, well-structured coding problems that test real-world programming skills.
Generate MULTIPLE unique questions covering different aspects of the topic.
Tailor problems to the specific job role and experience level.
Respond ONLY with valid JSON."""

CODE_BATCH_QUESTION_PROMPT = """Generate {count} coding questions for a technical assessment.

=== ASSESSMENT CONTEXT ===
Job Role: {job_designation}
Required Skills: {skills}
Experience Level: {experience_level} ({experience_years})
Organization: {organization_name}
Assessment Description: {assessment_description}

=== TOPIC DETAILS ===
Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}

=== ADDITIONAL CONTEXT ===
{context}

Create {count} UNIQUE coding questions that:
1. Reflect real problems a {job_designation} would solve
2. Match the experience level complexity expectations
3. Cover different aspects of the topic
4. Test practical programming skills
5. Have clear, unambiguous requirements
6. Include comprehensive test cases
7. Are diverse in problem type

Respond with JSON:
{{
  "questions": [
    {{
      "title": "Short descriptive title (3-6 words)",
      "problem_statement": "Detailed problem description in markdown",
      "constraints": ["constraint 1", "constraint 2"],
      "examples": [
        {{"input": "example input", "output": "expected output", "explanation": "why"}}
      ],
      "starter_code": {{
        "python": "def solution():\\n    pass",
        "javascript": "function solution() {{\\n}}"
      }},
      "test_cases": [
        {{"input": "test input", "expected_output": "output", "is_hidden": false, "points": 25}}
      ],
      "max_marks": 100,
      "time_estimate_minutes": 15,
      "hints": ["hint if stuck"]
    }}
  ]
}}

IMPORTANT:
- Generate exactly {count} questions
- Each "title" must be SHORT (3-6 words)
- Problems should be relevant to {job_designation} work
- Complexity should match {difficulty} for {experience_level} level"""

SUBJECTIVE_BATCH_QUESTION_SYSTEM_PROMPT = """You are an expert at creating subjective/open-ended assessment questions.
Create questions that assess deep understanding, critical thinking, and communication skills.
Generate MULTIPLE unique questions covering different aspects.
Tailor questions to the job role and industry context.
Respond ONLY with valid JSON."""

SUBJECTIVE_BATCH_QUESTION_PROMPT = """Generate {count} subjective questions for a technical assessment.

=== ASSESSMENT CONTEXT ===
Job Role: {job_designation}
Required Skills: {skills}
Experience Level: {experience_level} ({experience_years})
Organization: {organization_name}
Assessment Description: {assessment_description}

=== TOPIC DETAILS ===
Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}

=== ADDITIONAL CONTEXT ===
{context}

Create {count} UNIQUE subjective questions that:
1. Are relevant to a {job_designation} role
2. Match the expected depth for {experience_level} candidates
3. Cover different aspects of the topic
4. Require thoughtful, detailed responses
5. Test understanding and analysis skills
6. Have clear evaluation criteria

Respond with JSON:
{{
  "questions": [
    {{
      "title": "Short descriptive title (3-6 words)",
      "problem_statement": "The question in markdown format",
      "key_points": ["point 1 to cover", "point 2 to cover"],
      "sample_answer": "Brief outline of ideal answer",
      "max_marks": 20,
      "time_estimate_minutes": 10
    }}
  ]
}}

IMPORTANT:
- Generate exactly {count} questions
- Each "title" must be SHORT (3-6 words)
- Questions should reflect real scenarios for {job_designation}
- Cover different subtopics"""

SUBJECTIVE_QUESTION_SYSTEM_PROMPT = """You are an expert at creating subjective/open-ended assessment questions.
Create questions that assess deep understanding, critical thinking, and communication skills.
Include clear evaluation rubrics for consistent grading.
Respond ONLY with valid JSON."""

SUBJECTIVE_QUESTION_PROMPT = """Generate a subjective question for technical assessment.

Topic: {topic}
Subtopics: {subtopics}
Difficulty: {difficulty}
Experience Level: {experience_level}
Expected Response Length: {response_length}

Create a subjective question that:
1. Requires thoughtful, detailed responses
2. Tests understanding and analysis skills
3. Has clear evaluation criteria
4. Allows candidates to demonstrate expertise
5. Cannot be easily answered by copying from the internet

Respond with JSON:
{{
  "question": {{
    "question_text": "The question in markdown format",
    "context": "Any context or scenario description",
    "sub_questions": [
      {{
        "id": "a",
        "text": "Sub-question if applicable",
        "points": 10
      }}
    ],
    "expected_response_structure": "What a good answer should include",
    "evaluation_rubric": {{
      "excellent": {{
        "points_range": [90, 100],
        "criteria": ["demonstrates deep understanding", "provides specific examples"]
      }},
      "good": {{
        "points_range": [70, 89],
        "criteria": ["shows solid understanding", "mostly correct"]
      }},
      "satisfactory": {{
        "points_range": [50, 69],
        "criteria": ["basic understanding", "some gaps"]
      }},
      "needs_improvement": {{
        "points_range": [0, 49],
        "criteria": ["significant gaps", "misconceptions"]
      }}
    }},
    "key_points": ["point 1 that should be covered", "point 2"],
    "total_points": 100,
    "time_estimate_minutes": 10,
    "word_limit": 500,
    "tags": ["analysis", "design", "explanation"]
  }}
}}"""

CODE_EVALUATION_SYSTEM_PROMPT = """You are an expert code reviewer evaluating candidate submissions.
Assess code quality, correctness, efficiency, and best practices.
Provide constructive feedback that helps candidates improve.
Respond ONLY with valid JSON."""

CODE_EVALUATION_PROMPT = """Evaluate this code submission for a technical assessment.

Question:
{question}

Candidate's Submission:
```{language}
{code}
```

Test Case Results:
{test_results}

Evaluate based on:
1. Correctness - Does it solve the problem?
2. Efficiency - Time and space complexity
3. Code Quality - Readability, structure, naming
4. Best Practices - Error handling, edge cases
5. Creativity - Novel or elegant solutions

Respond with JSON:
{{
  "overall_score": 0-100,
  "correctness": {{
    "score": 0-100,
    "passed_tests": 8,
    "total_tests": 10,
    "feedback": "Feedback on correctness"
  }},
  "efficiency": {{
    "score": 0-100,
    "time_complexity": "O(n)",
    "space_complexity": "O(1)",
    "feedback": "Feedback on efficiency"
  }},
  "code_quality": {{
    "score": 0-100,
    "strengths": ["readable", "well-structured"],
    "improvements": ["could use better variable names"],
    "feedback": "Feedback on code quality"
  }},
  "best_practices": {{
    "score": 0-100,
    "observed": ["error handling", "input validation"],
    "missing": ["edge case handling"],
    "feedback": "Feedback on best practices"
  }},
  "detailed_feedback": "Overall feedback for the candidate",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "hiring_recommendation": {{
    "recommendation": "strong_yes|yes|maybe|no|strong_no",
    "justification": "Why this recommendation"
  }}
}}"""

SUBJECTIVE_EVALUATION_SYSTEM_PROMPT = """You are an expert evaluator assessing subjective responses.
Evaluate based on the rubric provided, focusing on understanding, analysis, and communication.
Provide detailed, constructive feedback.
Respond ONLY with valid JSON."""

SUBJECTIVE_EVALUATION_PROMPT = """Evaluate this subjective response for a technical assessment.

Question:
{question}

Evaluation Rubric:
{rubric}

Key Points Expected:
{key_points}

Candidate's Response:
{response}

Evaluate the response based on:
1. Coverage of key points
2. Depth of understanding
3. Clarity of explanation
4. Practical relevance
5. Critical thinking

Respond with JSON:
{{
  "overall_score": 0-100,
  "rubric_level": "excellent|good|satisfactory|needs_improvement",
  "key_points_coverage": [
    {{
      "point": "expected point",
      "covered": true,
      "quality": "excellent|good|partial|missing"
    }}
  ],
  "understanding": {{
    "score": 0-100,
    "feedback": "Assessment of conceptual understanding"
  }},
  "communication": {{
    "score": 0-100,
    "feedback": "Assessment of how well ideas were communicated"
  }},
  "analysis": {{
    "score": 0-100,
    "feedback": "Assessment of analytical thinking"
  }},
  "strengths": ["what the candidate did well"],
  "areas_for_improvement": ["what could be better"],
  "detailed_feedback": "Comprehensive feedback for the candidate",
  "hiring_recommendation": {{
    "recommendation": "strong_yes|yes|maybe|no|strong_no",
    "justification": "Why this recommendation"
  }}
}}"""

OVERALL_CANDIDATE_FEEDBACK_SYSTEM_PROMPT = """You are an expert at synthesizing assessment results into actionable feedback.
Create comprehensive, constructive feedback that helps candidates understand their performance.
Be encouraging while honest about areas for improvement.
Respond ONLY with valid JSON."""

OVERALL_CANDIDATE_FEEDBACK_PROMPT = """Generate comprehensive feedback for this candidate's assessment.

Assessment Title: {assessment_title}
Job Role: {job_role}

Topic-wise Performance:
{topic_scores}

Question-wise Results:
{question_results}

Overall Score: {overall_score}%
Percentile: {percentile}

Generate feedback that:
1. Summarizes overall performance
2. Highlights strengths
3. Identifies areas for improvement
4. Provides actionable recommendations
5. Maintains an encouraging tone

Respond with JSON:
{{
  "summary": "Brief overall performance summary",
  "strengths": [
    {{
      "area": "Topic/skill area",
      "description": "What the candidate did well",
      "evidence": "Specific examples from assessment"
    }}
  ],
  "areas_for_improvement": [
    {{
      "area": "Topic/skill area",
      "description": "What needs improvement",
      "resources": ["suggested learning resources"],
      "priority": "high|medium|low"
    }}
  ],
  "topic_feedback": [
    {{
      "topic": "Topic name",
      "score": 85,
      "performance_level": "excellent|good|satisfactory|needs_work",
      "feedback": "Specific feedback for this topic"
    }}
  ],
  "recommendations": [
    {{
      "recommendation": "Specific actionable recommendation",
      "reason": "Why this would help",
      "resources": ["links or course names"]
    }}
  ],
  "overall_assessment": "Comprehensive summary paragraph",
  "encouragement": "Encouraging closing message"
}}"""

PROCTORING_BEHAVIOR_ANALYSIS_PROMPT = """Analyze the proctoring events from this assessment attempt.

Proctoring Events:
{events}

Session Duration: {duration} minutes
Total Events: {event_count}

Analyze for:
1. Potential integrity concerns
2. Patterns of suspicious behavior
3. Technical issues vs intentional violations
4. Overall trustworthiness assessment

Respond with JSON:
{{
  "trust_score": 0-100,
  "trust_level": "high|medium|low|very_low",
  "integrity_assessment": {{
    "concerns": [
      {{
        "type": "tab_switching|face_detection|multiple_faces|fullscreen_exit",
        "severity": "low|medium|high|critical",
        "occurrences": 5,
        "assessment": "Analysis of this concern"
      }}
    ],
    "likely_explanations": ["possible innocent explanations"],
    "red_flags": ["definite concerns"]
  }},
  "patterns_detected": [
    {{
      "pattern": "Description of pattern",
      "interpretation": "What this might indicate"
    }}
  ],
  "technical_issues_detected": ["network issues", "camera problems"],
  "recommendation": {{
    "action": "proceed|review|flag_for_review|invalidate",
    "reason": "Why this recommendation",
    "additional_verification": ["suggested verification steps"]
  }},
  "summary": "Overall assessment of session integrity"
}}"""""
