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

JOB_DESCRIPTION_SYSTEM_PROMPT = """You are an expert technical recruiter and job description writer.
Generate compelling, accurate job descriptions based on team skill gaps and role requirements.
Focus on must-have skills derived from actual team needs.
Respond ONLY with valid JSON."""

JOB_DESCRIPTION_PROMPT = """Generate a job description based on team skill gaps.

Team Gap Analysis:
- Team size: {team_size}
- Critical missing skills: {critical_skills}
- Bus factor risks: {bus_factor_risks}

Role Context:
- Title: {role_title}
- Level: {level}
- Priority: {priority}

Roadmap Requirements (what the team needs to build):
{roadmap_context}

Target Role Template (if any):
{role_template}

Generate a comprehensive job description.

Respond with JSON:
{{
  "role_title": "Finalized title",
  "level": "Junior|Mid|Senior|Staff|Principal",
  "summary": "2-3 sentence role summary",
  "must_have_skills": [
    {{
      "skill": "skill name",
      "level": 60-100,
      "reasoning": "why this is critical"
    }}
  ],
  "nice_to_have_skills": [
    {{
      "skill": "skill name",
      "level": 40-70,
      "reasoning": "why this would help"
    }}
  ],
  "responsibilities": ["key responsibilities"],
  "qualifications": ["required qualifications"],
  "cultural_indicators": ["team culture aspects"],
  "full_text": "Complete formatted job description as markdown"
}}"""

INTERVIEW_RUBRIC_SYSTEM_PROMPT = """You are an expert technical interviewer.
Generate comprehensive interview rubrics that assess both technical skills and cultural fit.
Include specific questions with evaluation criteria and red flags.
Respond ONLY with valid JSON."""

INTERVIEW_RUBRIC_PROMPT = """Generate an interview rubric for assessing candidates.

Role: {role_title}
Level: {level}
Required Skills: {required_skills}
Nice-to-have Skills: {nice_to_have_skills}

Team Context:
- Team tech stack: {tech_stack}
- Team domains: {team_domains}
- Work style indicators: {work_style}

For each required skill, generate:
1. Technical questions (2-3 per skill)
2. Evaluation criteria (what to look for)
3. Red flags
4. Bonus indicators

Also include:
- System design prompt relevant to team's architecture
- Behavioral questions for soft skills
- Culture fit assessment criteria

Respond with JSON:
{{
  "role_title": "role",
  "technical_questions": [
    {{
      "question": "the question",
      "skill_assessed": "skill name",
      "difficulty": "easy|medium|hard",
      "evaluation_criteria": ["what good answers include"],
      "red_flags": ["warning signs"],
      "bonus_indicators": ["exceptional responses"]
    }}
  ],
  "behavioral_questions": [
    {{
      "question": "behavioral question",
      "skill_assessed": "communication|collaboration|leadership|mentorship",
      "difficulty": "medium",
      "evaluation_criteria": ["what to look for"],
      "red_flags": ["concerns"],
      "bonus_indicators": ["exceptional traits"]
    }}
  ],
  "system_design_prompt": "A system design prompt relevant to the role",
  "culture_fit_criteria": ["what makes someone a good cultural fit"]
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
