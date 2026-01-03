# Engineer Hiring Platform PRD
## Hiring Intelligence Module - Full Stack Assessment Platform

### Version: 1.0
### Date: January 3, 2026

---

## 1. Executive Summary

Build a comprehensive engineer hiring platform within the Hiring Intelligence module that enables organizations to create, distribute, and evaluate technical assessments for software engineering candidates. The platform leverages **Freestyle VMs** for secure code execution environments and **AI agents** for intelligent question generation and automated evaluation.

---

## 2. Product Overview

### 2.1 Vision
Create an end-to-end technical assessment platform that:
- Automates question generation using AI agents based on job requirements
- Provides secure, sandboxed code execution environments via Freestyle
- Delivers AI-powered evaluation with detailed feedback
- Offers comprehensive proctoring and trust scoring
- Supports multiple question formats including live coding assignments

### 2.2 Key Differentiators
| Feature | Traditional Platforms | Our Platform |
|---------|----------------------|--------------|
| Question Generation | Manual/Static bank | AI-generated based on role + skills |
| Code Execution | Limited sandboxes | Full Freestyle VMs with sub-second startup |
| Evaluation | Manual/Basic auto-grade | AI agent evaluation with detailed feedback |
| Environment | Single language | Full-stack (any language, databases, frameworks) |
| Scaling | Fixed resources | Instant VM forking for parallel execution |

---

## 3. User Personas

### 3.1 Hiring Manager / Recruiter
- Creates and manages assessments
- Reviews candidate reports and analytics
- Makes hiring decisions based on AI insights

### 3.2 Technical Interviewer
- Configures technical requirements and skill weights
- Reviews question-wise candidate performance
- Validates AI-generated questions

### 3.3 Candidate
- Takes assessments in a proctored environment
- Completes coding challenges in full-stack environments
- Receives feedback reports (optional)

### 3.4 Organization Admin
- Manages organization settings
- Configures integrations (ATS, HRIS)
- Accesses aggregate analytics

---

## 4. Feature Specifications

### 4.1 Dashboard (Management View)

#### 4.1.1 Overview Metrics
```
┌─────────────────────────────────────────────────────────────────┐
│  DASHBOARD                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │ + Create New     │  │  How to get started?                 │ │
│  │   Assessment     │  │  Watch demo to get started           │ │
│  └──────────────────┘  └──────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │    258     │ │     15     │ │    194     │ │    75%     │   │
│  │ Total      │ │ Total      │ │ Unique     │ │ Attempt    │   │
│  │ Candidates │ │ Tests      │ │ Attempts   │ │ Rate       │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │ Candidate Progress      │  │ Days vs Candidates Invited  │  │
│  │ Overview (Donut Chart)  │  │ (Line/Bar Chart)            │  │
│  │ - Shortlisted: 0        │  │ [Date Range Selector]       │  │
│  │ - Not Evaluated: 116    │  │                             │  │
│  │ - Rejected: 142         │  │                             │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Dashboard Data Model
```typescript
interface DashboardMetrics {
  totalCandidates: number;
  totalTests: number;
  uniqueAttempts: number;
  attemptRate: number; // percentage
  candidateProgress: {
    shortlisted: number;
    notEvaluated: number;
    rejected: number;
  };
  invitationTrend: {
    date: string;
    count: number;
  }[];
}
```

---

### 4.2 Assessment Management

#### 4.2.1 Assessment List View
| Column | Description | Sortable | Filterable |
|--------|-------------|----------|------------|
| Assessment Name | Title of the assessment | Yes | Yes (search) |
| Job Role | Target job designation | Yes | Yes (dropdown) |
| Experience | Required experience range (e.g., 1-3, 5-7) | Yes | Yes (range) |
| Candidates | Number of invited candidates | Yes | No |
| Deadline | Assessment end date | Yes | Yes (date range) |
| Status | Draft / Active / Completed / Archived | No | Yes (multi-select) |
| Date Created | Creation timestamp | Yes | Yes (date range) |
| Actions | View Report, Edit, Clone, Archive, Delete | No | No |

#### 4.2.2 Assessment Data Model
```typescript
interface Assessment {
  id: string;
  organizationId: string;

  // Step 1: Assessment Details
  title: string;
  jobDesignation: string;
  experienceRange: {
    min: number;
    max: number;
  };
  skills: string[]; // e.g., ["Data Structures", "React", "Node.js"]

  // Step 2: Topic Distribution
  topics: TopicConfig[];

  // Step 3: Schedule & Settings
  schedule: AssessmentSchedule;
  settings: AssessmentSettings;
  candidateQuestions: CandidateQuestion[];

  // Step 4: Candidates
  candidates: CandidateInvite[];

  // Metadata
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

interface TopicConfig {
  id: string;
  topic: string;
  questionTypes: QuestionTypeConfig[];
  difficultyLevel: 'easy' | 'medium' | 'hard';
  numberOfQuestions: number;
  additionalRequirements?: string;
}

interface QuestionTypeConfig {
  type: QuestionType;
  count: number;
}

type QuestionType =
  | 'code'           // Live coding in Freestyle VM
  | 'mcq'            // Multiple choice
  | 'subjective'     // Free-form text answer
  | 'pseudo_code'    // Algorithm in pseudo code
  | 'repeat_after_audio'    // Audio comprehension
  | 'transcribe_audio'      // Transcription test
  | 'spoken_answer'         // Verbal response
  | 'read_and_speak';       // Reading + speaking

interface AssessmentSchedule {
  mode: 'time_period' | 'duration';
  timePeriod?: {
    startTime: Date;
    endTime: Date;
  };
  duration?: {
    value: number;
    unit: 'hours' | 'days';
  };
}

interface AssessmentSettings {
  totalAttempts: number;
  proctoringEnabled: boolean;
  vpnRequired: boolean;
  linkSharingEnabled: boolean;
  mailFeedbackReport: boolean;
}

interface CandidateQuestion {
  field: string;
  required: boolean;
  type: 'text' | 'file' | 'url' | 'number';
}

// Default candidate questions available:
const DEFAULT_CANDIDATE_QUESTIONS = [
  'phone_number',
  'linkedin',
  'github',
  'current_location',
  'how_soon_can_you_join',
  'current_ctc',
  'expected_ctc',
  'work_experience',
  'open_to_relocation',
  'resume',
  'leetcode'
];
```

---

### 4.3 Assessment Creation Wizard (5 Steps) - Detailed Specification

#### 4.3.0 Wizard Overview & Navigation

##### Wizard State Management
```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  assessmentId: string | null; // null for new, ID for edit/draft
  isDraft: boolean;
  isEditing: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;

  // Step completion status
  stepStatus: {
    step1: 'incomplete' | 'complete' | 'error';
    step2: 'incomplete' | 'complete' | 'error';
    step3: 'incomplete' | 'complete' | 'error';
    step4: 'incomplete' | 'complete' | 'error';
    step5: 'incomplete' | 'complete' | 'error';
  };

  // Validation errors per step
  validationErrors: {
    step1: ValidationError[];
    step2: ValidationError[];
    step3: ValidationError[];
    step4: ValidationError[];
    step5: ValidationError[];
  };
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}
```

##### Progress Indicator Component
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                                                          │
│  SDE I  [ACTIVE]                    [< Previous] [Next Step >]  │
│                                                                  │
│  ●═══════════●═══════════○═══════════○═══════════○              │
│  1           2           3           4           5              │
│  Assessment  Topic       Schedule    Add         Review &       │
│  Details     Distribution Time       Candidates  Confirm        │
│  ✓ Complete  ✓ Complete  ● Current   ○ Pending   ○ Pending      │
└─────────────────────────────────────────────────────────────────┘

Legend:
● - Current step (orange filled)
✓ - Completed step (green with checkmark)
○ - Pending step (gray outline)
✗ - Error step (red with X)
```

##### Navigation Behavior
| Action | Behavior |
|--------|----------|
| Next Step | Validates current step → Auto-saves → Navigates to next |
| Previous Step | Auto-saves without validation → Navigates to previous |
| Click Step Indicator | Only allows navigation to completed steps or current step |
| Browser Back | Shows "unsaved changes" warning if dirty state |
| Close/Exit | Prompts to save as draft or discard |

##### Auto-Save Configuration
```typescript
interface AutoSaveConfig {
  enabled: boolean;
  intervalMs: 30000; // 30 seconds
  onFieldBlur: boolean;
  onStepChange: boolean;
  showIndicator: boolean; // "Saving..." / "Saved"
}
```

---

#### 4.3.1 Step 1: Assessment Details (Detailed)

##### UI Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│  SDE I  [DRAFT]                              [< Previous] [Next Step >] │
│                                                                          │
│  ●═══════════○═══════════○═══════════○═══════════○                      │
│  Assessment  Topic       Schedule    Add         Review &               │
│  Details     Distribution Time       Candidates  Confirm                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  BASIC INFORMATION                                                       │
│  ─────────────────                                                       │
│                                                                          │
│  Title of Assessment *                          Character count: 24/100 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Senior Software Engineer Assessment                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ℹ A clear, descriptive title helps candidates understand the role      │
│                                                                          │
│  ┌────────────────────────────────┐  ┌────────────────────────────┐    │
│  │ Job Designation *              │  │ Department (Optional)      │    │
│  │ ┌────────────────────────────┐ │  │ ┌────────────────────────┐ │    │
│  │ │ SDE II                   ▼ │ │  │ │ Engineering          ▼ │ │    │
│  │ └────────────────────────────┘ │  │ └────────────────────────┘ │    │
│  │ ○ SDE I (Entry Level)          │  │                            │    │
│  │ ● SDE II (Mid Level)           │  │ Departments:               │    │
│  │ ○ SDE III (Senior)             │  │ ○ Engineering              │    │
│  │ ○ Staff Engineer               │  │ ○ Product                  │    │
│  │ ○ Engineering Manager          │  │ ○ Data Science             │    │
│  │ ○ Principal Engineer           │  │ ○ DevOps                   │    │
│  │ ○ Custom: [______________]     │  │ ○ QA                       │    │
│  └────────────────────────────────┘  └────────────────────────────┘    │
│                                                                          │
│  EXPERIENCE REQUIREMENTS                                                 │
│  ───────────────────────                                                │
│                                                                          │
│  Experience Range (Years) *                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │     0    1    2    3    4    5    6    7    8    9   10   10+   │   │
│  │     ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤   │   │
│  │          [=========●==========]                                  │   │
│  │          2 years              5 years                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Selected: 2 - 5 years                                                  │
│                                                                          │
│  ┌─────────────────────────────┐                                        │
│  │ ☐ Include freshers (0 exp)  │  Allows candidates with no experience │
│  └─────────────────────────────┘                                        │
│                                                                          │
│  SKILLS TO ASSESS                                                        │
│  ────────────────                                                        │
│                                                                          │
│  Select the technical skills you want to evaluate *                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search skills...                                              │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Selected Skills (5):                                             │   │
│  │ ┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐    │   │
│  │ │ Data Structures ×│ │ Algorithms × │ │ System Design    × │    │   │
│  │ └──────────────────┘ └──────────────┘ └────────────────────┘    │   │
│  │ ┌──────────────┐ ┌────────────────┐                              │   │
│  │ │ Node.js    × │ │ React.js     × │                              │   │
│  │ └──────────────┘ └────────────────┘                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Minimum 1 skill required, Maximum 15 skills                            │
│                                                                          │
│  AI-Suggested Skills (based on job role):                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [+ PostgreSQL] [+ Redis] [+ Docker] [+ AWS] [+ TypeScript]      │   │
│  │ [+ GraphQL] [+ REST APIs] [+ Git] [+ CI/CD] [+ Testing]         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Browse by Category:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [Languages ▼] [Frameworks ▼] [Databases ▼] [Cloud ▼] [Tools ▼]  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Languages:                                                       │   │
│  │ ☐ JavaScript    ☐ Python       ☐ Java         ☐ Go              │   │
│  │ ☐ TypeScript    ☐ C++          ☐ Rust         ☐ Ruby            │   │
│  │ ☐ C#            ☐ Kotlin       ☐ Swift        ☐ PHP             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  SKILL WEIGHTS (Optional - Advanced)                                    │
│  ─────────────────────────────────                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ☐ Enable custom skill weights                                    │   │
│  │                                                                   │   │
│  │ When enabled, you can assign importance weights to each skill:   │   │
│  │ • Data Structures: [====●=====] 50%                              │   │
│  │ • Algorithms:      [======●===] 70%                              │   │
│  │ • System Design:   [========●=] 90%                              │   │
│  │ • Node.js:         [===●======] 40%                              │   │
│  │ • React.js:        [===●======] 40%                              │   │
│  │                                         Total Weight: 290%       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ASSESSMENT DESCRIPTION (Optional)                                      │
│  ─────────────────────────────────                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ This assessment evaluates candidates for the SDE II position    │   │
│  │ focusing on full-stack development skills with emphasis on      │   │
│  │ system design and scalability...                                │   │
│  │                                                                  │   │
│  │ [B] [I] [U] [Link] [List]                        500/2000 chars │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ℹ This description will be shown to candidates before starting        │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [Save as Draft]                                      [Next Step →]     │
│                                    Auto-saved 2 minutes ago             │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Step 1 Field Specifications

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Title | Text | Yes | 3-100 chars, alphanumeric + spaces | Empty |
| Job Designation | Dropdown + Custom | Yes | Must select or enter custom | Empty |
| Department | Dropdown | No | From predefined list | None |
| Experience Min | Number/Slider | Yes | 0-20 years | 0 |
| Experience Max | Number/Slider | Yes | > Min, max 20 years | 3 |
| Include Freshers | Checkbox | No | Boolean | false |
| Skills | Multi-select tags | Yes | 1-15 skills | Empty |
| Skill Weights | Slider per skill | No | 0-100% per skill | Equal weight |
| Description | Rich text | No | 0-2000 chars | Empty |

##### Step 1 Data Model
```typescript
interface Step1Data {
  title: string;
  jobDesignation: {
    type: 'predefined' | 'custom';
    value: string;
  };
  department?: string;
  experienceRange: {
    min: number;
    max: number;
    includeFreshers: boolean;
  };
  skills: {
    id: string;
    name: string;
    category: string;
    weight?: number; // 0-100, only if custom weights enabled
  }[];
  enableSkillWeights: boolean;
  description?: string;
}
```

##### Step 1 Validation Rules
```typescript
const step1ValidationRules = {
  title: {
    required: true,
    minLength: 3,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-_]+$/,
    errorMessages: {
      required: 'Assessment title is required',
      minLength: 'Title must be at least 3 characters',
      maxLength: 'Title cannot exceed 100 characters',
      pattern: 'Title can only contain letters, numbers, spaces, hyphens, and underscores'
    }
  },
  jobDesignation: {
    required: true,
    errorMessages: {
      required: 'Please select or enter a job designation'
    }
  },
  experienceRange: {
    required: true,
    custom: (value) => value.max >= value.min,
    errorMessages: {
      required: 'Experience range is required',
      custom: 'Maximum experience must be greater than or equal to minimum'
    }
  },
  skills: {
    required: true,
    minItems: 1,
    maxItems: 15,
    errorMessages: {
      required: 'At least one skill is required',
      minItems: 'Please select at least one skill',
      maxItems: 'Maximum 15 skills can be selected'
    }
  }
};
```

##### Step 1 API Interactions
```typescript
// On Step Load (for edit mode)
GET /api/v1/assessments/:id/step/1
Response: Step1Data

// On skill search
GET /api/v1/skills/search?q={query}&category={category}
Response: { skills: Skill[], suggestions: Skill[] }

// On AI skill suggestion
POST /api/v1/ai/suggest-skills
Body: { jobDesignation: string, existingSkills: string[] }
Response: { suggestedSkills: Skill[] }

// On auto-save / Next Step
PUT /api/v1/assessments/:id/step/1
Body: Step1Data
Response: { success: boolean, assessmentId: string }

// For new assessment
POST /api/v1/assessments
Body: Step1Data
Response: { assessmentId: string }
```

##### AI Integration: Skill Suggestions
```typescript
interface SkillSuggestionRequest {
  jobDesignation: string;
  department?: string;
  experienceRange: { min: number; max: number };
  existingSkills: string[];
}

interface SkillSuggestionResponse {
  suggestedSkills: {
    skill: string;
    relevanceScore: number; // 0-1
    reason: string; // "Common for SDE II roles"
    category: string;
  }[];
  skillCombinations: {
    name: string; // "Full-Stack Web Development"
    skills: string[];
  }[];
}
```

---

#### 4.3.2 Step 2: Topic Distribution (Detailed)

##### UI Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│  SDE I  [DRAFT]                              [< Previous] [Next Step >] │
│                                                                          │
│  ○═══════════●═══════════○═══════════○═══════════○                      │
│  Assessment  Topic       Schedule    Add         Review &               │
│  Details ✓   Distribution Time       Candidates  Confirm                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ASSESSMENT SUMMARY                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Total Questions: 9    │ Est. Duration: 2h 15m │ Max Score: 450  │   │
│  │ Code: 4 │ MCQ: 2 │ Subjective: 2 │ Other: 1                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ [🤖 AI Generate Topics] [📊 Reset Distribution] [👁 Preview All]│    │
│  │ [📥 Import from Template] [💾 Save as Template]                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  TOPIC CONFIGURATION                                                     │
│  ───────────────────                                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ⋮⋮│ # │ Topic              │ Types          │ Diff │ Qty │ Time │⚙│ │
│  ├───┼───┼────────────────────┼────────────────┼──────┼─────┼──────┼─┤ │
│  │ ⋮⋮│ 1 │ Arrays & Hashing ▼ │ ┌────────────┐ │Med ▼ │ 2   │ 30m  │⋮│ │
│  │   │   │                    │ │ Code     × │ │      │     │      │ │ │
│  │   │   │ [+ Add Subtopic]   │ │ MCQ      × │ │      │     │      │ │ │
│  │   │   │                    │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  │   │   │ Additional Requirements:                                 │ │ │
│  │   │   │ [Focus on sliding window and two-pointer techniques]    │ │ │
│  ├───┼───┼────────────────────────────────────────────────────────┼─┤ │
│  │ ⋮⋮│ 2 │ Trees & Graphs   ▼ │ ┌────────────┐ │Med ▼ │ 2   │ 35m  │⋮│ │
│  │   │   │ • Binary Trees     │ │ Code     × │ │      │     │      │ │ │
│  │   │   │ • BST Operations   │ │ Pseudo   × │ │      │     │      │ │ │
│  │   │   │                    │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  ├───┼───┼────────────────────────────────────────────────────────┼─┤ │
│  │ ⋮⋮│ 3 │ Dynamic Prog.    ▼ │ ┌────────────┐ │Hard▼ │ 1   │ 25m  │⋮│ │
│  │   │   │                    │ │ Code     × │ │      │     │      │ │ │
│  │   │   │                    │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  ├───┼───┼────────────────────────────────────────────────────────┼─┤ │
│  │ ⋮⋮│ 4 │ System Design    ▼ │ ┌────────────┐ │Hard▼ │ 1   │ 45m  │⋮│ │
│  │   │   │                    │ │ Subjective│ │      │     │      │ │ │
│  │   │   │                    │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  ├───┼───┼────────────────────────────────────────────────────────┼─┤ │
│  │ ⋮⋮│ 5 │ React.js         ▼ │ ┌────────────┐ │Med ▼ │ 2   │ 20m  │⋮│ │
│  │   │   │ • Component Life   │ │ MCQ      × │ │      │     │      │ │ │
│  │   │   │ • Hooks            │ │ Code     × │ │      │     │      │ │ │
│  │   │   │ • State Mgmt       │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  ├───┼───┼────────────────────────────────────────────────────────┼─┤ │
│  │ ⋮⋮│ 6 │ Node.js Backend  ▼ │ ┌────────────┐ │Med ▼ │ 1   │ 20m  │⋮│ │
│  │   │   │ • Express APIs     │ │ Code     × │ │      │     │      │ │ │
│  │   │   │ • Middleware       │ │ [+ Add]    │ │      │     │      │ │ │
│  │   │   │                    │ └────────────┘ │      │     │      │ │ │
│  └───┴───┴────────────────────────────────────────────────────────┴─┘ │
│                                                                          │
│  [+ Add New Topic]                                                       │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  QUESTION TYPE DETAILS                                                   │
│  ─────────────────────                                                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ CODE QUESTIONS (Freestyle VM)                                      │ │
│  │ ───────────────────────────────                                    │ │
│  │ Questions: 6 │ Est. Time: 90 min │ Points: 300                     │ │
│  │                                                                     │ │
│  │ Execution Environment:                                             │ │
│  │ ┌──────────────────────────────────────────────────────────────┐  │ │
│  │ │ Allowed Languages: [JavaScript ×] [Python ×] [Java ×] [+ Add]│  │ │
│  │ │                                                               │  │ │
│  │ │ VM Configuration:                                             │  │ │
│  │ │ • Memory Limit:   [512 MB ▼] per execution                   │  │ │
│  │ │ • Time Limit:     [10 sec ▼] per test case                   │  │ │
│  │ │ • Max Submissions: [10 ▼] attempts per question              │  │ │
│  │ │                                                               │  │ │
│  │ │ ☑ Allow candidates to run code before submitting             │  │ │
│  │ │ ☑ Show sample test case results                              │  │ │
│  │ │ ☐ Show hidden test case count                                │  │ │
│  │ │ ☐ Allow partial scoring (per test case)                      │  │ │
│  │ └──────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ MCQ QUESTIONS                                                      │ │
│  │ ─────────────                                                      │ │
│  │ Questions: 2 │ Est. Time: 10 min │ Points: 50                      │ │
│  │                                                                     │ │
│  │ Settings:                                                          │ │
│  │ • ☑ Randomize option order                                        │ │
│  │ • ☑ Allow multiple correct answers                                │ │
│  │ • ☐ Negative marking: [-0.25 ▼] per wrong answer                  │ │
│  │ • ☐ Show correct answer after submission                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ SUBJECTIVE QUESTIONS                                               │ │
│  │ ────────────────────                                               │ │
│  │ Questions: 1 │ Est. Time: 45 min │ Points: 100                     │ │
│  │                                                                     │ │
│  │ Settings:                                                          │ │
│  │ • Min Word Count: [100 ▼]    Max Word Count: [2000 ▼]             │ │
│  │ • ☑ Allow diagrams/drawings                                       │ │
│  │ • ☑ Enable rich text formatting                                   │ │
│  │ • Evaluation: [AI + Manual Review ▼]                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ AUDIO/VERBAL QUESTIONS                                             │ │
│  │ ───────────────────────                                            │ │
│  │                                                                     │ │
│  │ Available Types:                                                   │ │
│  │ ┌────────────────┬──────────────────────────────────────────────┐ │ │
│  │ │ Type           │ Description                                   │ │ │
│  │ ├────────────────┼──────────────────────────────────────────────┤ │ │
│  │ │ Repeat After   │ Candidate listens to audio and repeats.      │ │ │
│  │ │ Audio          │ Tests pronunciation and comprehension.       │ │ │
│  │ ├────────────────┼──────────────────────────────────────────────┤ │ │
│  │ │ Transcribe     │ Candidate types what they hear.              │ │ │
│  │ │ Audio          │ Tests listening and typing accuracy.         │ │ │
│  │ ├────────────────┼──────────────────────────────────────────────┤ │ │
│  │ │ Spoken Answer  │ Candidate records verbal response.           │ │ │
│  │ │                │ AI evaluates content and communication.      │ │ │
│  │ ├────────────────┼──────────────────────────────────────────────┤ │ │
│  │ │ Read and Speak │ Candidate reads passage aloud.               │ │ │
│  │ │                │ Tests reading fluency and pronunciation.     │ │ │
│  │ └────────────────┴──────────────────────────────────────────────┘ │ │
│  │                                                                     │ │
│  │ ⚠ Audio questions require microphone access. Candidates will be   │ │
│  │   prompted to grant permission before starting the assessment.     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [Save as Draft]                          [< Previous] [Next Step →]    │
│                                    Auto-saved 2 minutes ago             │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Topic Row Actions Menu (⋮)
```
┌────────────────────────┐
│ 👁 Preview Questions   │
│ 🔄 Regenerate AI Q's   │
│ ✏️ Edit Topic Details  │
│ 📋 Duplicate Topic     │
│ ⬆️ Move Up             │
│ ⬇️ Move Down           │
│ ─────────────────────  │
│ 🗑️ Delete Topic        │
└────────────────────────┘
```

##### Question Preview Modal
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PREVIEW: Arrays & Hashing Questions                              [×]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Question 1 of 2 (Code)                           [< Prev] [Next >]     │
│  ─────────────────────                                                   │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ TWO SUM                                          Difficulty: Medium│  │
│  │                                                                    │  │
│  │ Given an array of integers nums and an integer target, return     │  │
│  │ indices of the two numbers such that they add up to target.       │  │
│  │                                                                    │  │
│  │ You may assume that each input would have exactly one solution,   │  │
│  │ and you may not use the same element twice.                       │  │
│  │                                                                    │  │
│  │ Example 1:                                                        │  │
│  │ Input: nums = [2,7,11,15], target = 9                             │  │
│  │ Output: [0,1]                                                     │  │
│  │ Explanation: nums[0] + nums[1] == 9, so we return [0, 1].        │  │
│  │                                                                    │  │
│  │ Example 2:                                                        │  │
│  │ Input: nums = [3,2,4], target = 6                                 │  │
│  │ Output: [1,2]                                                     │  │
│  │                                                                    │  │
│  │ Constraints:                                                      │  │
│  │ • 2 <= nums.length <= 10^4                                        │  │
│  │ • -10^9 <= nums[i] <= 10^9                                        │  │
│  │ • -10^9 <= target <= 10^9                                         │  │
│  │                                                                    │  │
│  │ ─────────────────────────────────────────────────────────────     │  │
│  │ Test Cases: 10 (3 visible, 7 hidden)                              │  │
│  │ Time Limit: 10 seconds                                            │  │
│  │ Memory Limit: 512 MB                                              │  │
│  │ Points: 50                                                        │  │
│  │ Estimated Time: 15 minutes                                        │  │
│  │                                                                    │  │
│  │ Tags: [Hash Table] [Array] [Two Pointers]                        │  │
│  │                                                                    │  │
│  │ Evaluation Rubric:                                                │  │
│  │ • Correctness (60%): All test cases pass                         │  │
│  │ • Efficiency (25%): O(n) time complexity                          │  │
│  │ • Code Quality (15%): Clean, readable code                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ [✏️ Edit Question] [🔄 Regenerate] [🗑️ Replace with Different] │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│                                                    [Close Preview]       │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Step 2 Data Model
```typescript
interface Step2Data {
  topics: TopicConfiguration[];
  questionTypeSettings: QuestionTypeSettings;
  totalQuestions: number;
  estimatedDuration: number; // minutes
  maxScore: number;
}

interface TopicConfiguration {
  id: string;
  order: number;
  topic: string;
  subtopics: string[];
  questionTypes: {
    type: QuestionType;
    count: number;
  }[];
  difficultyLevel: 'easy' | 'medium' | 'hard' | 'mixed';
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  estimatedTime: number; // minutes
  maxScore: number;
  additionalRequirements?: string;

  // Generated questions (populated by AI)
  questions: GeneratedQuestion[];
  questionsStatus: 'pending' | 'generating' | 'generated' | 'error';
}

interface QuestionTypeSettings {
  code: {
    allowedLanguages: string[];
    memoryLimit: number; // MB
    timeLimit: number; // seconds per test case
    maxSubmissions: number;
    allowRunBeforeSubmit: boolean;
    showSampleResults: boolean;
    showHiddenTestCount: boolean;
    partialScoring: boolean;
  };
  mcq: {
    randomizeOptions: boolean;
    allowMultipleCorrect: boolean;
    negativeMarking: boolean;
    negativeMarkValue: number;
    showCorrectAfterSubmit: boolean;
  };
  subjective: {
    minWordCount: number;
    maxWordCount: number;
    allowDiagrams: boolean;
    allowRichText: boolean;
    evaluationMode: 'ai_only' | 'manual_only' | 'ai_plus_manual';
  };
  audio: {
    maxRecordingDuration: number; // seconds
    allowRetakes: number;
    evaluationCriteria: string[];
  };
}

type QuestionType =
  | 'code'
  | 'mcq'
  | 'subjective'
  | 'pseudo_code'
  | 'repeat_after_audio'
  | 'transcribe_audio'
  | 'spoken_answer'
  | 'read_and_speak'
  | 'fullstack_assignment'; // Freestyle VM based
```

##### AI Topic & Question Generation
```typescript
// Request AI to suggest topics based on Step 1 data
interface TopicSuggestionRequest {
  skills: string[];
  jobDesignation: string;
  experienceRange: { min: number; max: number };
  assessmentDuration?: number; // preferred total duration
  questionMix?: {
    code?: number;      // percentage
    mcq?: number;
    subjective?: number;
    other?: number;
  };
}

interface TopicSuggestionResponse {
  suggestedTopics: {
    topic: string;
    subtopics: string[];
    recommendedQuestionTypes: QuestionType[];
    difficulty: 'easy' | 'medium' | 'hard';
    reasoning: string;
    estimatedTime: number;
  }[];

  recommendedDistribution: {
    totalQuestions: number;
    codeQuestions: number;
    mcqQuestions: number;
    subjectiveQuestions: number;
    estimatedDuration: number;
  };
}

// Request AI to generate questions for a topic
interface QuestionGenerationRequest {
  topic: string;
  subtopics: string[];
  questionType: QuestionType;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  experienceLevel: { min: number; max: number };
  additionalRequirements?: string;

  // For code questions
  allowedLanguages?: string[];

  // For MCQ
  optionsCount?: number;

  // Avoid similar questions
  existingQuestionIds?: string[];
}

interface GeneratedQuestion {
  id: string;
  topic: string;
  type: QuestionType;
  difficulty: 'easy' | 'medium' | 'hard';

  // Common fields
  title: string;
  problemStatement: string;
  maxMarks: number;
  estimatedTime: number; // minutes
  tags: string[];

  // For coding questions
  inputFormat?: string;
  outputFormat?: string;
  examples?: {
    input: string;
    output: string;
    explanation?: string;
  }[];
  constraints?: string[];
  hints?: string[];
  testCases?: {
    id: string;
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    weight: number;
    explanation?: string;
  }[];
  solutionApproach?: string;
  optimalComplexity?: {
    time: string;
    space: string;
  };
  starterCode?: {
    [language: string]: string;
  };

  // For MCQ
  options?: {
    id: string;
    text: string;
    isCorrect: boolean;
    explanation?: string;
  }[];

  // For subjective
  sampleAnswer?: string;
  keyPoints?: string[];

  // For audio questions
  audioUrl?: string;
  transcript?: string;

  // Evaluation rubric (for all types)
  evaluationRubric: {
    criterion: string;
    maxScore: number;
    description: string;
    scoringGuide?: {
      score: number;
      description: string;
    }[];
  }[];
}
```

##### Full-Stack Assignment Configuration (Special Question Type)
```typescript
interface FullStackAssignmentConfig {
  id: string;
  title: string;
  description: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'devops' | 'data_engineering';

  // Duration and scoring
  duration: number; // minutes
  maxScore: number;

  // Freestyle VM configuration
  vmConfig: {
    template: string; // 'node-react', 'python-django', 'java-spring', etc.
    cpu: number;
    memory: number; // MB
    disk: number; // GB

    // Pre-installed integrations
    integrations: ('node' | 'python' | 'java' | 'postgresql' | 'mongodb' | 'redis' | 'docker')[];

    // Network access
    networkMode: 'full' | 'restricted' | 'none';
    allowedDomains?: string[];

    // Exposed ports for preview
    exposedPorts: {
      port: number;
      label: string;
      healthCheck?: string; // endpoint to verify service is running
    }[];
  };

  // Starter code / repository
  starterCode: {
    type: 'repository' | 'files' | 'template';
    repository?: string; // Git URL
    branch?: string;
    files?: {
      path: string;
      content: string;
      readonly?: boolean;
    }[];
    template?: string; // predefined template ID
  };

  // Problem statement
  problemStatement: {
    overview: string;
    requirements: {
      id: string;
      description: string;
      points: number;
      isMandatory: boolean;
    }[];
    bonusRequirements?: {
      id: string;
      description: string;
      points: number;
    }[];
    technicalNotes?: string;
    hints?: string[];
  };

  // Evaluation
  evaluation: {
    // Automated tests (run in forked VM)
    automatedTests?: {
      testCommand: string;
      timeout: number; // seconds
      testFilePattern?: string;
    };

    // AI evaluation criteria
    aiEvaluation: {
      enabled: boolean;
      criteria: {
        name: string;
        weight: number; // percentage
        description: string;
        checkpoints: string[]; // what to look for
      }[];
    };

    // Manual review
    manualReview: {
      required: boolean;
      reviewerInstructions?: string;
    };
  };

  // Submission requirements
  submission: {
    requireAllTestsPass: boolean;
    minRequirementsMet: number; // minimum mandatory requirements
    requireScreenRecording: boolean;
    requireCodeExplanation: boolean; // candidate explains their approach
  };
}

// Example Full-Stack Assignment
const exampleFullStackAssignment: FullStackAssignmentConfig = {
  id: 'fs-ecommerce-001',
  title: 'E-Commerce Product Review System',
  description: 'Build a complete product review feature',
  type: 'fullstack',
  duration: 120, // 2 hours
  maxScore: 200,

  vmConfig: {
    template: 'node-react',
    cpu: 2,
    memory: 4096,
    disk: 10,
    integrations: ['node', 'postgresql', 'redis'],
    networkMode: 'restricted',
    allowedDomains: ['npmjs.org', 'yarnpkg.com'],
    exposedPorts: [
      { port: 3000, label: 'React Frontend', healthCheck: '/' },
      { port: 8080, label: 'Express API', healthCheck: '/health' }
    ]
  },

  starterCode: {
    type: 'repository',
    repository: 'https://github.com/company/assessment-starter',
    branch: 'product-review-starter'
  },

  problemStatement: {
    overview: `You are tasked with building a product review system for an e-commerce platform.
               The system should allow users to submit, view, and filter product reviews.`,
    requirements: [
      {
        id: 'req-1',
        description: 'Create POST /api/products/:id/reviews endpoint to submit a review',
        points: 30,
        isMandatory: true
      },
      {
        id: 'req-2',
        description: 'Create GET /api/products/:id/reviews endpoint with pagination',
        points: 25,
        isMandatory: true
      },
      {
        id: 'req-3',
        description: 'Implement input validation and error handling',
        points: 20,
        isMandatory: true
      },
      {
        id: 'req-4',
        description: 'Build React component to display reviews with star ratings',
        points: 35,
        isMandatory: true
      },
      {
        id: 'req-5',
        description: 'Add filtering by rating (1-5 stars)',
        points: 25,
        isMandatory: false
      },
      {
        id: 'req-6',
        description: 'Implement review caching with Redis',
        points: 30,
        isMandatory: false
      }
    ],
    bonusRequirements: [
      {
        id: 'bonus-1',
        description: 'Add sentiment analysis to flag negative reviews',
        points: 20
      },
      {
        id: 'bonus-2',
        description: 'Implement real-time review updates using WebSockets',
        points: 15
      }
    ],
    technicalNotes: `
      - PostgreSQL database is pre-configured with products table
      - Redis is available on localhost:6379
      - Use the provided schema.sql for review table structure
    `,
    hints: [
      'Start with the API endpoints before the frontend',
      'Use the provided test data in seeds/ folder',
      'Consider edge cases like empty reviews or invalid product IDs'
    ]
  },

  evaluation: {
    automatedTests: {
      testCommand: 'npm test',
      timeout: 300,
      testFilePattern: 'tests/**/*.test.js'
    },
    aiEvaluation: {
      enabled: true,
      criteria: [
        {
          name: 'API Design',
          weight: 25,
          description: 'RESTful conventions, proper status codes, error handling',
          checkpoints: [
            'Correct HTTP methods used',
            'Proper status codes returned',
            'Validation errors have clear messages',
            'Consistent response format'
          ]
        },
        {
          name: 'Code Quality',
          weight: 25,
          description: 'Clean, readable, well-structured code',
          checkpoints: [
            'Meaningful variable and function names',
            'Proper separation of concerns',
            'No code duplication',
            'Consistent formatting'
          ]
        },
        {
          name: 'Functionality',
          weight: 35,
          description: 'All requirements implemented correctly',
          checkpoints: [
            'Reviews can be created',
            'Reviews can be retrieved with pagination',
            'Frontend displays reviews correctly',
            'Filtering works as expected'
          ]
        },
        {
          name: 'Performance',
          weight: 15,
          description: 'Efficient queries, proper caching',
          checkpoints: [
            'Database queries are optimized',
            'Caching is implemented correctly',
            'No N+1 query problems'
          ]
        }
      ]
    },
    manualReview: {
      required: false
    }
  },

  submission: {
    requireAllTestsPass: false,
    minRequirementsMet: 3,
    requireScreenRecording: true,
    requireCodeExplanation: true
  }
};
```

---

#### 4.3.3 Step 3: Schedule Time & Settings (Detailed)

##### UI Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│  SDE I  [DRAFT]                              [< Previous] [Next Step >] │
│                                                                          │
│  ○═══════════○═══════════●═══════════○═══════════○                      │
│  Assessment  Topic       Schedule    Add         Review &               │
│  Details ✓   Distrib. ✓  Time       Candidates  Confirm                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ASSESSMENT SCHEDULE                                                     │
│  ───────────────────                                                     │
│                                                                          │
│  How should candidates access this assessment?                          │
│                                                                          │
│  ┌────────────────────────────────────┐  ┌────────────────────────────┐ │
│  │ ○ Fixed Time Period                │  │ ● Flexible Duration        │ │
│  │   ─────────────────────            │  │   ──────────────────       │ │
│  │   Assessment is available only     │  │   Assessment is available  │ │
│  │   during a specific time window.   │  │   for X days/hours after   │ │
│  │                                    │  │   invitation is sent.      │ │
│  │   Best for: Batch hiring, campus   │  │                            │ │
│  │   recruitment, scheduled tests     │  │   Best for: Rolling hires, │ │
│  │                                    │  │   flexible scheduling      │ │
│  │   ┌──────────────────────────────┐ │  │                            │ │
│  │   │ Start Date & Time            │ │  │   ┌──────────────────────┐ │ │
│  │   │ [📅 dd/mm/yyyy] [🕐 --:--]   │ │  │   │ Duration After Invite│ │ │
│  │   │                              │ │  │   │                      │ │ │
│  │   │ End Date & Time              │ │  │   │ [7 ▼] [Days ▼]       │ │ │
│  │   │ [📅 dd/mm/yyyy] [🕐 --:--]   │ │  │   │                      │ │ │
│  │   │                              │ │  │   │ Candidates have 7    │ │ │
│  │   │ Timezone: [IST (UTC+5:30) ▼] │ │  │   │ days to complete     │ │ │
│  │   └──────────────────────────────┘ │  │   │ from invite date.    │ │ │
│  │                                    │  │   └──────────────────────┘ │ │
│  └────────────────────────────────────┘  └────────────────────────────┘ │
│                                                                          │
│  ASSESSMENT DURATION                                                     │
│  ───────────────────                                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ How is the test duration determined?                               │ │
│  │                                                                     │ │
│  │ ○ AI-Calculated Duration (Recommended)                             │ │
│  │   Based on question count and complexity, AI suggests: 2h 15m      │ │
│  │   [View calculation breakdown]                                     │ │
│  │                                                                     │ │
│  │ ● Fixed Duration                                                   │ │
│  │   Set a specific time limit for the assessment                     │ │
│  │   ┌─────────────────────────────────────────────────────────────┐ │ │
│  │   │ Duration: [2] hours [30] minutes                             │ │ │
│  │   │                                                               │ │ │
│  │   │ ⚠ AI recommendation: 2h 15m based on 9 questions             │ │ │
│  │   │   Your setting: 2h 30m (+15 min buffer)                      │ │ │
│  │   └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                     │ │
│  │ ☐ Allow extra time for candidates with accommodations              │ │
│  │   Extra time percentage: [50%] (adds 1h 15m for this assessment)  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ATTEMPT SETTINGS                                                        │
│  ────────────────                                                        │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Total Attempts Allowed per Candidate                               │ │
│  │ ┌─────────────────────────────────────────────────────────────┐   │ │
│  │ │ [1 ▼]  attempt(s)                                           │   │ │
│  │ └─────────────────────────────────────────────────────────────┘   │ │
│  │                                                                     │ │
│  │ ☐ Allow candidates to resume if they disconnect                   │ │
│  │   └─ Grace period: [15 ▼] minutes to reconnect                    │ │
│  │                                                                     │ │
│  │ ☐ Allow section-wise submission                                    │ │
│  │   └─ Candidates can submit sections independently                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  PROCTORING SETTINGS                                                     │
│  ───────────────────                                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Enable Proctoring?  [Yes ▼]                                        │ │
│  │                                                                     │ │
│  │ ┌──────────────────────────────────────────────────────────────┐  │ │
│  │ │ PROCTORING FEATURES                           Enabled        │  │ │
│  │ ├──────────────────────────────────────────────────────────────┤  │ │
│  │ │ 📷 Webcam Monitoring                          [✓]            │  │ │
│  │ │    Record candidate during assessment                        │  │ │
│  │ │                                                              │  │ │
│  │ │ 🖥️ Screen Recording                           [✓]            │  │ │
│  │ │    Record candidate's screen during assessment               │  │ │
│  │ │                                                              │  │ │
│  │ │ 👤 Face Detection                             [✓]            │  │ │
│  │ │    Verify candidate is present throughout                    │  │ │
│  │ │                                                              │  │ │
│  │ │ 👥 Multiple Face Detection                    [✓]            │  │ │
│  │ │    Alert if multiple people detected                         │  │ │
│  │ │                                                              │  │ │
│  │ │ 🔄 Tab Switch Detection                       [✓]            │  │ │
│  │ │    Track when candidate switches browser tabs                │  │ │
│  │ │                                                              │  │ │
│  │ │ 📋 Copy/Paste Tracking                        [✓]            │  │ │
│  │ │    Log clipboard usage during assessment                     │  │ │
│  │ │                                                              │  │ │
│  │ │ 🖥️ External Monitor Detection                 [○]            │  │ │
│  │ │    Detect additional displays connected                      │  │ │
│  │ │                                                              │  │ │
│  │ │ 📍 IP Address Tracking                        [✓]            │  │ │
│  │ │    Log and detect IP changes during session                  │  │ │
│  │ └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │ Strictness Level: [Medium ▼]                                       │ │
│  │ • Low: Monitoring only, no restrictions                            │ │
│  │ • Medium: Warns on violations, allows continuation                 │ │
│  │ • High: Strict mode - terminates on repeated violations            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  SECURITY SETTINGS                                                       │
│  ─────────────────                                                       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ☐ Require VPN Connection                                          │ │
│  │   └─ Only candidates connected to company VPN can access          │ │
│  │   └─ VPN Server: [vpn.company.com_____________]                   │ │
│  │                                                                     │ │
│  │ ☐ IP Whitelist                                                    │ │
│  │   └─ Only allow access from specific IP ranges                    │ │
│  │   └─ [+ Add IP Range]                                             │ │
│  │                                                                     │ │
│  │ ☐ Require Full Screen Mode                                        │ │
│  │   └─ Candidate must stay in fullscreen throughout                 │ │
│  │                                                                     │ │
│  │ ☐ Disable Right Click / Developer Tools                           │ │
│  │   └─ Prevents inspection of page content                          │ │
│  │                                                                     │ │
│  │ ☐ Browser Lockdown                                                │ │
│  │   └─ Requires Safe Exam Browser (SEB) or similar                  │ │
│  │   └─ Download link will be sent to candidates                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  LINK & SHARING SETTINGS                                                 │
│  ───────────────────────                                                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ☐ Enable Public Link Sharing                                      │ │
│  │   └─ Anyone with the link can take the assessment                 │ │
│  │   └─ ⚠ Not recommended for formal hiring                          │ │
│  │                                                                     │ │
│  │ ☑ Send Feedback Report to Candidates                              │ │
│  │   └─ Automatically email results after evaluation                 │ │
│  │   └─ Report includes: [Score ✓] [Strong Areas ✓] [Feedback ✓]    │ │
│  │   └─ Delay sending by: [24 ▼] hours after completion             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  CANDIDATE INFORMATION COLLECTION                                        │
│  ────────────────────────────────                                        │
│                                                                          │
│  Select information to collect from candidates before starting:         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ CONTACT & IDENTITY                                                 │ │
│  │ ┌────────────────────────────────────────────────────────────────┐│ │
│  │ │ ☑ Phone Number *        ☐ Current Location                    ││ │
│  │ │ ☑ Resume/CV *           ☐ Profile Photo                       ││ │
│  │ │ ☐ Government ID         ☐ Date of Birth                       ││ │
│  │ └────────────────────────────────────────────────────────────────┘│ │
│  │                                                                     │ │
│  │ PROFESSIONAL                                                       │ │
│  │ ┌────────────────────────────────────────────────────────────────┐│ │
│  │ │ ☐ LinkedIn Profile      ☐ Current Company                     ││ │
│  │ │ ☐ GitHub Profile        ☐ Current Role                        ││ │
│  │ │ ☐ Portfolio URL         ☐ Years of Experience                 ││ │
│  │ │ ☐ LeetCode Profile      ☐ Notice Period                       ││ │
│  │ └────────────────────────────────────────────────────────────────┘│ │
│  │                                                                     │ │
│  │ COMPENSATION & AVAILABILITY                                        │ │
│  │ ┌────────────────────────────────────────────────────────────────┐│ │
│  │ │ ☐ Current CTC           ☐ Open to Relocation                  ││ │
│  │ │ ☐ Expected CTC          ☐ Preferred Work Mode                 ││ │
│  │ │ ☐ How soon can you join?                                      ││ │
│  │ └────────────────────────────────────────────────────────────────┘│ │
│  │                                                                     │ │
│  │ CUSTOM QUESTIONS                                                   │ │
│  │ ┌────────────────────────────────────────────────────────────────┐│ │
│  │ │ 1. Why are you interested in this role? [Text] [Required ✓]   ││ │
│  │ │    [✏️ Edit] [🗑️ Delete]                                       ││ │
│  │ │                                                                 ││ │
│  │ │ 2. Are you authorized to work in India? [Yes/No] [Required ✓] ││ │
│  │ │    [✏️ Edit] [🗑️ Delete]                                       ││ │
│  │ │                                                                 ││ │
│  │ │ [+ Add Custom Question]                                        ││ │
│  │ └────────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  * Fields marked required must be filled by candidate to start          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [Save as Draft]                          [< Previous] [Next Step →]    │
│                                    Auto-saved 2 minutes ago             │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Custom Question Builder Modal
```
┌─────────────────────────────────────────────────────────────────┐
│  ADD CUSTOM QUESTION                                       [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Question Text *                                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Why are you interested in this role at our company?       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Response Type *                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○ Short Text (Single line)                              │   │
│  │ ● Long Text (Paragraph)                                 │   │
│  │ ○ Single Select (Dropdown/Radio)                        │   │
│  │ ○ Multiple Select (Checkboxes)                          │   │
│  │ ○ Yes/No                                                │   │
│  │ ○ Number                                                │   │
│  │ ○ Date                                                  │   │
│  │ ○ File Upload                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [For Long Text]                                                │
│  Character Limit: [500 ▼]                                       │
│  Placeholder Text: [Share your motivation...               ]    │
│                                                                  │
│  Settings                                                       │
│  ☑ Required field                                               │
│  ☐ Show help text                                               │
│     Help text: [________________________________]               │
│                                                                  │
│                         [Cancel] [Add Question]                 │
└─────────────────────────────────────────────────────────────────┘
```

##### Step 3 Data Model
```typescript
interface Step3Data {
  // Schedule
  scheduleMode: 'fixed_period' | 'flexible_duration';
  fixedPeriod?: {
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
  };
  flexibleDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };

  // Duration
  durationMode: 'ai_calculated' | 'fixed';
  aiCalculatedDuration?: number; // minutes
  fixedDuration?: {
    hours: number;
    minutes: number;
  };
  allowExtraTime: boolean;
  extraTimePercentage?: number;

  // Attempts
  totalAttempts: number;
  allowResume: boolean;
  resumeGracePeriod?: number; // minutes
  allowSectionwiseSubmission: boolean;

  // Proctoring
  proctoringEnabled: boolean;
  proctoringSettings?: {
    webcamMonitoring: boolean;
    screenRecording: boolean;
    faceDetection: boolean;
    multipleFaceDetection: boolean;
    tabSwitchDetection: boolean;
    copyPasteTracking: boolean;
    externalMonitorDetection: boolean;
    ipTracking: boolean;
    strictnessLevel: 'low' | 'medium' | 'high';
  };

  // Security
  securitySettings: {
    requireVpn: boolean;
    vpnServer?: string;
    ipWhitelist: boolean;
    allowedIpRanges?: string[];
    requireFullscreen: boolean;
    disableDevTools: boolean;
    browserLockdown: boolean;
  };

  // Link & Sharing
  enablePublicLink: boolean;
  sendFeedbackReport: boolean;
  feedbackReportSettings?: {
    includeScore: boolean;
    includeStrongAreas: boolean;
    includeFeedback: boolean;
    delayHours: number;
  };

  // Candidate Information
  candidateFields: CandidateField[];
  customQuestions: CustomQuestion[];
}

interface CandidateField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'file' | 'url' | 'number' | 'date' | 'select';
  category: 'contact' | 'professional' | 'compensation' | 'custom';
  required: boolean;
  enabled: boolean;
  options?: string[]; // for select type
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    fileTypes?: string[];
    maxFileSize?: number;
  };
}

interface CustomQuestion {
  id: string;
  questionText: string;
  responseType: 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'yes_no' | 'number' | 'date' | 'file';
  required: boolean;
  options?: string[]; // for select types
  characterLimit?: number;
  placeholderText?: string;
  helpText?: string;
}
```

---

#### 4.3.4 Step 4: Add Candidates (Detailed)

##### UI Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│  SDE I  [DRAFT]                              [< Previous] [Next Step >] │
│                                                                          │
│  ○═══════════○═══════════○═══════════●═══════════○                      │
│  Assessment  Topic       Schedule    Add         Review &               │
│  Details ✓   Distrib. ✓  Time ✓     Candidates  Confirm                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ADD CANDIDATES                                                          │
│  ──────────────                                                          │
│                                                                          │
│  You can add candidates by uploading a file or adding them manually.    │
│  Candidates will be invited when you publish the assessment.            │
│                                                                          │
│  ┌───────────────────────────────────┐ ┌───────────────────────────────┐│
│  │ 📁 BULK UPLOAD                    │ │ 👤 ADD MANUALLY               ││
│  │ ─────────────                     │ │ ────────────                  ││
│  │                                   │ │                               ││
│  │ ┌───────────────────────────────┐ │ │ Candidate Name *              ││
│  │ │                               │ │ │ ┌─────────────────────────┐  ││
│  │ │     📄 Drag and drop your     │ │ │ │ John Doe                │  ││
│  │ │        CSV or Excel file      │ │ │ └─────────────────────────┘  ││
│  │ │                               │ │ │                               ││
│  │ │     or [Browse Files]         │ │ │ Email Address *               ││
│  │ │                               │ │ │ ┌─────────────────────────┐  ││
│  │ │ Supported: .csv, .xlsx, .xls  │ │ │ │ john.doe@email.com      │  ││
│  │ └───────────────────────────────┘ │ │ └─────────────────────────┘  ││
│  │                                   │ │                               ││
│  │ File Format:                      │ │ Source (Optional)             ││
│  │ name, email, source (optional)    │ │ ┌─────────────────────────┐  ││
│  │                                   │ │ │ LinkedIn            ▼   │  ││
│  │ [📥 Download Sample CSV]          │ │ └─────────────────────────┘  ││
│  │ [📥 Download Excel Template]      │ │                               ││
│  │                                   │ │           [+ Add Candidate]  ││
│  └───────────────────────────────────┘ └───────────────────────────────┘│
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 📊 IMPORT FROM ATS / HRIS                                          │ │
│  │ ─────────────────────────                                          │ │
│  │                                                                     │ │
│  │ Import candidates directly from your connected systems:            │ │
│  │                                                                     │ │
│  │ [🔗 Greenhouse] [🔗 Lever] [🔗 Workday] [🔗 BambooHR]              │ │
│  │                                                                     │ │
│  │ ℹ Configure integrations in Organization Settings                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  SHARE ASSESSMENT                                                        │
│  ────────────────                                                        │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Assessment Link (for manual sharing):                              │ │
│  │ ┌──────────────────────────────────────────────────────┐ [📋 Copy]│ │
│  │ │ https://assess.company.com/take/sde-i-abc123xyz      │          │ │
│  │ └──────────────────────────────────────────────────────┘          │ │
│  │                                                                     │ │
│  │ ⚠ Link sharing is currently disabled. Only invited candidates      │ │
│  │   can access the assessment. Enable in Schedule settings.          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ [📧 Preview Email Template] [✏️ Customize Email]                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  CANDIDATES LIST (23 candidates)                                         │
│  ───────────────────────────────                                         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 🔍 Search candidates...                 [Filter ▼] [Select All ☐] │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ ☐ │ Name                │ Email                  │ Source  │ Status│ │
│  ├───┼─────────────────────┼────────────────────────┼─────────┼───────┤ │
│  │ ☐ │ Nandani Verma       │ nandani@gmail.com     │LinkedIn │ New   │ │
│  │ ☐ │ Stuti Sood          │ stuti@gmail.com       │ Referral│ New   │ │
│  │ ☐ │ Sonu Gautam         │ sonu@gmail.com        │ Direct  │ New   │ │
│  │ ☐ │ Shariq Hashmi       │ shariq@gmail.com      │LinkedIn │ New   │ │
│  │ ☐ │ Ritesh Kumar        │ ritesh@gmail.com      │Naukri   │ New   │ │
│  │ ☐ │ Mangesh Bodke       │ mangesh@gmail.com     │ Direct  │ New   │ │
│  │   │ ...                  │                       │         │       │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Showing 1-10 of 23                          [< Prev] [1] [2] [3] [>]│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ BULK ACTIONS (0 selected):                                         │ │
│  │ [🗑️ Remove Selected] [📤 Export Selected] [🏷️ Update Source]      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [Save as Draft]                          [< Previous] [Next Step →]    │
│                                    Auto-saved 2 minutes ago             │
└─────────────────────────────────────────────────────────────────────────┘
```

##### CSV Upload Processing
```
┌─────────────────────────────────────────────────────────────────┐
│  PROCESSING UPLOAD                                         [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  File: candidates_batch_1.csv                                   │
│                                                                  │
│  ████████████████████████████░░░░░░░░░░  75%                    │
│  Processing row 75 of 100...                                    │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  VALIDATION RESULTS                                             │
│                                                                  │
│  ✅ Valid entries:        92                                    │
│  ⚠️ Warnings:              5                                    │
│  ❌ Errors:                3                                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ISSUES FOUND                                             │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ Row 15: Invalid email format "john.doe@"                │   │
│  │ Row 28: Duplicate email "existing@company.com"          │   │
│  │ Row 45: Missing required field "name"                   │   │
│  │ Row 67: ⚠️ Email already in another assessment          │   │
│  │ Row 89: ⚠️ Unusual characters in name                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [📥 Download Error Report]                                     │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  How would you like to proceed?                                 │
│                                                                  │
│  ○ Import valid entries only (92 candidates)                    │
│  ○ Import valid + warnings (97 candidates)                      │
│  ○ Cancel and fix all issues                                    │
│                                                                  │
│                              [Cancel] [Proceed with Import]     │
└─────────────────────────────────────────────────────────────────┘
```

##### Email Customization Modal
```
┌─────────────────────────────────────────────────────────────────────────┐
│  CUSTOMIZE INVITATION EMAIL                                        [×]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────┬──────────────────────────────┐   │
│  │ EDIT                              │ PREVIEW                       │   │
│  ├───────────────────────────────────┼──────────────────────────────┤   │
│  │                                   │                               │   │
│  │ Subject Line:                     │ To: john.doe@email.com       │   │
│  │ ┌───────────────────────────────┐ │ Subject: You're invited...   │   │
│  │ │ You're invited to complete a  │ │                               │   │
│  │ │ technical assessment for      │ │ ┌─────────────────────────┐  │   │
│  │ │ {JobRole} at {Company}        │ │ │     [COMPANY LOGO]      │  │   │
│  │ └───────────────────────────────┘ │ │                         │  │   │
│  │                                   │ │ Dear John,               │  │   │
│  │ Email Body:                       │ │                         │  │   │
│  │ ┌───────────────────────────────┐ │ │ You have been invited  │  │   │
│  │ │ Dear {CandidateName},         │ │ │ to complete a technical │  │   │
│  │ │                               │ │ │ assessment for the SDE  │  │   │
│  │ │ You have been invited to      │ │ │ II position at TechCorp.│  │   │
│  │ │ complete a technical          │ │ │                         │  │   │
│  │ │ assessment for the {JobRole}  │ │ │ Assessment Details:     │  │   │
│  │ │ position at {Company}.        │ │ │ • Duration: ~2h 30m     │  │   │
│  │ │                               │ │ │ • Questions: 9          │  │   │
│  │ │ Assessment Details:           │ │ │ • Deadline: 7 days      │  │   │
│  │ │ • Duration: ~{Duration}       │ │ │                         │  │   │
│  │ │ • Questions: {QuestionCount}  │ │ │ [Start Assessment]      │  │   │
│  │ │ • Deadline: {Deadline}        │ │ │                         │  │   │
│  │ │                               │ │ │ Good luck!              │  │   │
│  │ │ [B] [I] [U] [Link] [Var ▼]   │ │ │                         │  │   │
│  │ └───────────────────────────────┘ │ │ Best regards,           │  │   │
│  │                                   │ │ TechCorp Hiring Team    │  │   │
│  │ Available Variables:              │ └─────────────────────────┘  │   │
│  │ {CandidateName} {Company}         │                               │   │
│  │ {JobRole} {Duration}              │                               │   │
│  │ {QuestionCount} {Deadline}        │                               │   │
│  │ {AssessmentLink} {SupportEmail}   │                               │   │
│  │                                   │                               │   │
│  └───────────────────────────────────┴──────────────────────────────┘   │
│                                                                          │
│  ☐ Send test email to me (recruiter@company.com)                        │
│                                                                          │
│                [Reset to Default] [Cancel] [Save Template]              │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Step 4 Data Model
```typescript
interface Step4Data {
  candidates: CandidateEntry[];
  emailTemplate: EmailTemplate;
  assessmentLink: string;
  importHistory: ImportRecord[];
}

interface CandidateEntry {
  id: string;
  name: string;
  email: string;
  source?: string; // 'LinkedIn', 'Referral', 'Direct', etc.
  status: 'new' | 'invited' | 'started' | 'completed';
  addedAt: Date;
  addedBy: string;
  addedVia: 'manual' | 'csv' | 'excel' | 'ats_integration';
  metadata?: Record<string, any>;
}

interface EmailTemplate {
  subject: string;
  body: string;
  isCustomized: boolean;
  lastModified?: Date;
}

interface ImportRecord {
  id: string;
  fileName: string;
  importedAt: Date;
  totalRows: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  errors: {
    row: number;
    field: string;
    message: string;
  }[];
}
```

---

#### 4.3.5 Step 5: Review & Confirm (Detailed)

##### UI Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│  SDE I  [DRAFT]                                                         │
│                                                                          │
│  ○═══════════○═══════════○═══════════○═══════════●                      │
│  Assessment  Topic       Schedule    Add         Review &               │
│  Details ✓   Distrib. ✓  Time ✓     Candidates ✓ Confirm               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  REVIEW YOUR ASSESSMENT                                                  │
│  ──────────────────────                                                  │
│                                                                          │
│  Please review all details before publishing. Once published,           │
│  candidates will receive invitations immediately.                       │
│                                                                          │
│  ┌───────────────────────────┬──────────────────────────────────────┐   │
│  │ 📋 ASSESSMENT DETAILS     │ 📊 TOPIC DISTRIBUTION                │   │
│  ├───────────────────────────┼──────────────────────────────────────┤   │
│  │                           │                                       │   │
│  │ Name                      │ Question Breakdown                    │   │
│  │ SDE II Assessment         │ ┌──────────────────────────────────┐ │   │
│  │                           │ │ Code          ████████░░ 6 (67%) │ │   │
│  │ Job Designation           │ │ MCQ           ██░░░░░░░░ 2 (22%) │ │   │
│  │ SDE II                    │ │ Subjective    █░░░░░░░░░ 1 (11%) │ │   │
│  │                           │ └──────────────────────────────────┘ │   │
│  │ Experience Range          │                                       │   │
│  │ 2 - 5 Years               │ Topics Covered                        │   │
│  │                           │ • Arrays & Hashing (2 questions)     │   │
│  │ Skills (5)                │ • Trees & Graphs (2 questions)       │   │
│  │ [Data Structures]         │ • Dynamic Programming (1 question)   │   │
│  │ [Algorithms]              │ • System Design (1 question)         │   │
│  │ [System Design]           │ • React.js (2 questions)             │   │
│  │ [Node.js]                 │ • Node.js Backend (1 question)       │   │
│  │ [React.js]                │                                       │   │
│  │                           │ Total Questions: 9                    │   │
│  │          [✏️ Change]      │ Max Score: 450 points                │   │
│  │                           │                                       │   │
│  │                           │          [✏️ Change] [👁 Preview All]│   │
│  └───────────────────────────┴──────────────────────────────────────┘   │
│                                                                          │
│  ┌───────────────────────────┬──────────────────────────────────────┐   │
│  │ ⏰ SCHEDULE & SETTINGS    │ 👥 CANDIDATES                         │   │
│  ├───────────────────────────┼──────────────────────────────────────┤   │
│  │                           │                                       │   │
│  │ Availability              │ Total Candidates                      │   │
│  │ 7 days after invitation   │ ┌──────────────────────────────────┐ │   │
│  │                           │ │            23                     │ │   │
│  │ Duration                  │ │         candidates                │ │   │
│  │ 2 hours 30 minutes        │ └──────────────────────────────────┘ │   │
│  │                           │                                       │   │
│  │ Attempts Allowed          │ By Source                             │   │
│  │ 1 attempt                 │ • LinkedIn: 12                        │   │
│  │                           │ • Referral: 6                         │   │
│  │ ─────────────────         │ • Direct: 5                           │   │
│  │                           │                                       │   │
│  │ Proctoring: ✅ Enabled    │ ─────────────────                     │   │
│  │ • Webcam monitoring       │                                       │   │
│  │ • Screen recording        │ Email Preview:                        │   │
│  │ • Face detection          │ "You're invited to complete..."      │   │
│  │ • Tab switch tracking     │ [👁 Preview Full Email]               │   │
│  │                           │                                       │   │
│  │ Security                  │ Invitation will be sent to all       │   │
│  │ • VPN Required: ❌ No     │ candidates immediately upon publish. │   │
│  │ • Link Sharing: ❌ No     │                                       │   │
│  │                           │                                       │   │
│  │ Feedback                  │                                       │   │
│  │ • Send Report: ✅ Yes     │                                       │   │
│  │ • Delay: 24 hours         │                                       │   │
│  │                           │                                       │   │
│  │          [✏️ Change]      │          [✏️ Change]                  │   │
│  └───────────────────────────┴──────────────────────────────────────┘   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  PRE-PUBLISH CHECKLIST                                                   │
│  ─────────────────────                                                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ✅ Assessment has a title and job designation                      │ │
│  │ ✅ At least one skill selected                                     │ │
│  │ ✅ Questions generated for all topics (9 questions)                │ │
│  │ ✅ Schedule configured                                             │ │
│  │ ✅ At least one candidate added (23 candidates)                    │ │
│  │ ✅ Email template configured                                       │ │
│  │ ⚠️ Proctoring enabled - ensure candidates know webcam is required │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  PUBLISH OPTIONS                                                         │
│  ───────────────                                                         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ When should invitations be sent?                                   │ │
│  │                                                                     │ │
│  │ ● Immediately after publishing                                     │ │
│  │   Candidates will receive emails right away                        │ │
│  │                                                                     │ │
│  │ ○ Schedule for later                                               │ │
│  │   [📅 Select date and time]                                        │ │
│  │                                                                     │ │
│  │ ○ Don't send invitations (publish only)                            │ │
│  │   Assessment will be active but candidates won't be notified       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [💾 Save as Draft]     [< Previous Step]     [🚀 Publish Now]  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  By publishing, 23 candidates will receive invitation emails.           │
│  This action cannot be undone.                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

##### Publish Confirmation Modal
```
┌─────────────────────────────────────────────────────────────────┐
│  🚀 PUBLISH ASSESSMENT                                     [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  You are about to publish "SDE II Assessment"                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ SUMMARY                                                    │  │
│  │                                                            │  │
│  │ • 23 candidates will receive invitation emails             │  │
│  │ • Assessment will be available for 7 days                  │  │
│  │ • Duration: 2 hours 30 minutes                             │  │
│  │ • Proctoring is enabled                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⚠️ IMPORTANT                                                   │
│  • You can add more candidates after publishing                 │
│  • You cannot modify questions after candidates start           │
│  • You can extend the deadline if needed                        │
│                                                                  │
│  Type "PUBLISH" to confirm:                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                              [Cancel] [🚀 Publish Assessment]   │
└─────────────────────────────────────────────────────────────────┘
```

##### Post-Publish Success Screen
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                         🎉                                       │
│                                                                  │
│              ASSESSMENT PUBLISHED SUCCESSFULLY!                  │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  "SDE II Assessment" is now live                                │
│                                                                  │
│  📧 23 invitation emails are being sent                         │
│  ⏱️ Candidates have 7 days to complete                          │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  WHAT'S NEXT?                                                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [📊 View Dashboard]     Track candidate progress        │   │
│  │ [👥 Add More Candidates] Invite additional candidates   │   │
│  │ [📋 View Assessment]    See assessment details          │   │
│  │ [🔗 Copy Link]          Share assessment link           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│                         [Go to Dashboard]                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

##### Step 5 Data Model
```typescript
interface Step5Data {
  // Pre-publish checklist
  checklist: {
    hasTitle: boolean;
    hasSkills: boolean;
    hasQuestions: boolean;
    hasSchedule: boolean;
    hasCandidates: boolean;
    hasEmailTemplate: boolean;
  };

  // Publish options
  publishOptions: {
    sendInvitations: 'immediately' | 'scheduled' | 'manual';
    scheduledDateTime?: Date;
  };

  // Summary (read-only, computed from previous steps)
  summary: {
    assessmentName: string;
    jobDesignation: string;
    totalQuestions: number;
    totalCandidates: number;
    duration: string;
    availability: string;
    proctoringEnabled: boolean;
  };
}
```

---

#### 4.3.6 Wizard API Endpoints

```yaml
# Wizard Navigation
GET    /api/v1/assessments/:id/wizard/status
       Response: { currentStep, stepStatus, validationErrors }

# Step-specific endpoints
GET    /api/v1/assessments/:id/step/:stepNumber
       Response: StepData for that step

PUT    /api/v1/assessments/:id/step/:stepNumber
       Body: StepData
       Response: { success, validationErrors, nextStepEnabled }

# Validation
POST   /api/v1/assessments/:id/step/:stepNumber/validate
       Body: StepData
       Response: { isValid, errors, warnings }

# Auto-save
POST   /api/v1/assessments/:id/autosave
       Body: { step, data }
       Response: { success, savedAt }

# AI Generation (Step 2)
POST   /api/v1/assessments/:id/topics/suggest
       Body: { skills, jobDesignation, experienceRange }
       Response: { suggestedTopics }

POST   /api/v1/assessments/:id/questions/generate
       Body: { topic, questionType, difficulty, count }
       Response: { questions }

POST   /api/v1/assessments/:id/questions/regenerate/:questionId
       Response: { newQuestion }

# Candidate Import (Step 4)
POST   /api/v1/assessments/:id/candidates/import
       Body: FormData (file)
       Response: { validCount, errorCount, errors, candidates }

POST   /api/v1/assessments/:id/candidates/validate-email
       Body: { email }
       Response: { isValid, isDuplicate, existingAssessments }

# Email Template (Step 4)
GET    /api/v1/assessments/:id/email-template
PUT    /api/v1/assessments/:id/email-template
POST   /api/v1/assessments/:id/email-template/preview
       Body: { candidateId }
       Response: { subject, body (rendered) }

# Publish (Step 5)
POST   /api/v1/assessments/:id/publish
       Body: { sendInvitations, scheduledDateTime? }
       Response: { success, assessmentStatus, invitationsSent }

GET    /api/v1/assessments/:id/publish/preview
       Response: { checklist, summary, warnings }
```

---

### 4.4 Candidate Report System

#### 4.4.1 Assessment Report - Candidates Tab
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back To Home                                                  │
│                                                                  │
│  SDE I                            [⬇] [👤] [✏] [🔗] ⏱ 00H:00M:00S│
│  ○ 03 Jan 05:27 PM - 03 Jan 05:27 PM                            │
│                                                                  │
│  [Candidates]  [Analytics]                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔍 Search Candidates              [📧] [📊] [👁] [⚙ Filter]    │
│                                                                  │
│  ☐ │ Candidate                     │ Strong Areas    │ Score │  │
│  ──┼───────────────────────────────┼─────────────────┼───────│  │
│  ☐ │ Ritesh Kumar                  │ [Redux Mid...+4]│  79%  │  │
│    │ work.ritesh14@gmail.com       │                 │       │  │
│  ──┼───────────────────────────────┼─────────────────┼───────│  │
│  ☐ │ Mangesh Bodke                 │ [Array Man...+4]│  74%  │  │
│    │ mangesh2025@gmail.com         │                 │       │  │
│  ──┼───────────────────────────────┼─────────────────┼───────│  │
│  ☐ │ Puneet Pahuja                 │ [Hash-Base...+4]│  68%  │  │
│    │ puneet1098@gmail.com          │                 │       │  │
│                                                                  │
│  Bulk Actions: [✉ Email] [📥 Export] [🏷 Tag] [❌ Reject]       │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4.2 Individual Candidate Report - Overall Report
```
┌─────────────────────────────────────────────────────────────────┐
│  SDE I                                                          │
│                                                                  │
│  [Overall Report]  [Question Wise Report]                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │               │  │ Total Time      │  │ Score           │   │
│  │  [Photo]      │  │                 │  │                 │   │
│  │               │  │   1:31:33       │  │     79%         │   │
│  │               │  │                 │  │                 │   │
│  └───────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                  │
│  Candidate Name:    ┌─────────────────────────────────────────┐ │
│  Ritesh Roushan     │ TRUST SCORE                             │ │
│  Kumar              │                                         │ │
│                     │        100%                             │ │
│  Contact:           │                                         │ │
│  7462986815         │ Tab Switched: 0     IP Mismatch: 0     │ │
│                     │ Out of Frame: 1     Ext Monitor: N     │ │
│  Email:             │ Clicked Outside: 1  Fullscreen Exit: N │ │
│  work.ritesh14@     │ Multiple Faces: 0   Extension: N       │ │
│  gmail.com          │                                         │ │
│                     └─────────────────────────────────────────┘ │
│  Resume:                                                        │
│  [📥 Download]      ┌─────────────────────────────────────────┐ │
│                     │ STRONG POINTS          AREAS TO IMPROVE │ │
│                     │ [Redux Middleware]     [React State     │ │
│                     │ [MongoDB Atomic Ops]    Anti-patterns]  │ │
│                     │ [Binary Tree]          [DP Modifica-    │ │
│                     │ [JWT Auth Flow]         tions]          │ │
│                     │ [RESTful API Design]   [API Versioning] │ │
│                     │                        [Error Handling] │ │
│                     └─────────────────────────────────────────┘ │
│                                                                  │
│  OVERALL FEEDBACK (AI Generated)                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Solid understanding of algorithms, data structures, and │   │
│  │ full-stack development. Strong in Redux middleware,     │   │
│  │ atomic database operations, and tree manipulation. Weak │   │
│  │ in React anti-patterns, API versioning depth, and DP    │   │
│  │ algorithm modifications for domain-specific features.   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4.3 Individual Candidate Report - Question Wise
```
┌─────────────────────────────────────────────────────────────────┐
│  SDE I                                                          │
│                                                                  │
│  [Overall Report]  [Question Wise Report]                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Question 1:                    Marks    Time     Time Taken    │
│  ────────────────────────────   72/80   15 min    11 min 34s   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Minimum Deletions to Anagram                            │   │
│  │                                                         │   │
│  │ Two girls are writing a word each on separate pieces    │   │
│  │ of paper. The words may or may not hold any meaning     │   │
│  │ and can be of different lengths. They both are starting │   │
│  │ to learn about anagrams. An anagram of a string is      │   │
│  │ basically a string which is its permutation. However,   │   │
│  │ they face a lot of issues in this process. Your task    │   │
│  │ is to help them find the minimum number of deletions    │   │
│  │ to be made in those words (total count of deletions in  │   │
│  │ both strings) such that both words are anagrams.        │   │
│  │                                                         │   │
│  │ Input Format:                                           │   │
│  │ The first line contains a single string.                │   │
│  │ The second line contains a single string.               │   │
│  │                                                         │   │
│  │ Output Format:                                          │   │
│  │ A single integer denoting the minimum number of         │   │
│  │ deletions to be made in both strings.                   │   │
│  │                                                         │   │
│  │ Example 1:                                              │   │
│  │ Input: ...                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ FEEDBACK (AI Generated)                                 │   │
│  │                                                         │   │
│  │ The candidate demonstrates a solid understanding of the │   │
│  │ anagram problem and frequency counting approach. The    │   │
│  │ solution correctly uses character frequency arrays and  │   │
│  │ calculates the absolute difference to determine         │   │
│  │ deletions needed. The code passes 9 out of 10 test     │   │
│  │ cases, indicating the core logic is sound. However,    │   │
│  │ one test case fails, likely due to edge case handling. │   │
│  │ The candidate shows good programming practices with    │   │
│  │ input validation checks, though the uppercase handling │   │
│  │ is unnecessary given the constraint specifies          │   │
│  │ lowercase letters only. Overall, a strong attempt with │   │
│  │ minor issues in edge case coverage.                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [View Code Submission] [View Test Results] [View Recording]    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4.4 Candidate Report Data Model
```typescript
interface CandidateReport {
  id: string;
  assessmentId: string;
  candidateId: string;

  // Candidate Info
  candidate: {
    name: string;
    email: string;
    phone?: string;
    photo?: string;
    resumeUrl?: string;
    linkedIn?: string;
    github?: string;
    customFields: Record<string, any>;
  };

  // Overall Metrics
  totalAssessmentTime: number; // seconds
  scorePercentage: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'evaluated';

  // Trust Score / Proctoring
  trustScore: TrustScore;

  // AI Analysis
  strongPoints: SkillTag[];
  areasOfImprovement: SkillTag[];
  overallFeedback: string;

  // Question-wise results
  questionResults: QuestionResult[];

  // Timestamps
  startedAt?: Date;
  completedAt?: Date;
  evaluatedAt?: Date;
}

interface TrustScore {
  score: number; // 0-100
  violations: {
    tabSwitched: number;
    outOfFrame: number;
    clickedOutsideWindow: number;
    multipleFacesDetected: number;
    externalMonitorDetected: boolean;
    fullscreenExited: boolean;
    extensionDetected: boolean;
    ipMismatch: number;
    vpnDetected?: boolean;
  };
  recordings?: {
    webcam?: string;
    screen?: string;
  };
}

interface SkillTag {
  skill: string;
  confidence: number; // 0-1
  basedOn: string[]; // question IDs
}

interface QuestionResult {
  questionId: string;
  questionNumber: number;
  topic: string;
  questionType: QuestionType;

  // Scoring
  marksObtained: number;
  maxMarks: number;

  // Timing
  totalTimeAllowed: number;
  timeTaken: number;

  // Submission
  submission: CodeSubmission | MCQSubmission | SubjectiveSubmission;

  // AI Evaluation
  feedback: string;
  rubricScores: {
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }[];

  // For code questions
  testCaseResults?: {
    testCaseId: string;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    executionTime: number;
    memoryUsed: number;
  }[];
}

interface CodeSubmission {
  type: 'code';
  language: string;
  code: string;
  compilationResult?: {
    success: boolean;
    errors?: string[];
  };
  executionLogs?: string[];
}
```

---

### 4.5 Analytics Dashboard

#### 4.5.1 Assessment Analytics
```
┌─────────────────────────────────────────────────────────────────┐
│  SDE I - Analytics                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │ Score Distribution      │  │ Completion Funnel           │  │
│  │ (Histogram)             │  │                             │  │
│  │                         │  │ Invited ──────────▶ 258     │  │
│  │     ▓▓                  │  │ Started ──────────▶ 194     │  │
│  │   ▓▓▓▓▓                 │  │ Completed ────────▶ 180     │  │
│  │  ▓▓▓▓▓▓▓                │  │ Evaluated ────────▶ 142     │  │
│  │ ▓▓▓▓▓▓▓▓▓               │  │ Shortlisted ──────▶ 0       │  │
│  │ 0-20 40-60 80-100       │  │                             │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │ Topic-wise Performance  │  │ Time Analysis               │  │
│  │ (Radar Chart)           │  │                             │  │
│  │                         │  │ Avg Completion: 1h 45m      │  │
│  │     Arrays              │  │ Fastest: 45m                │  │
│  │        /\               │  │ Slowest: 2h 30m             │  │
│  │    DP /  \ Trees        │  │                             │  │
│  │       ----              │  │ [Time Distribution Chart]   │  │
│  │                         │  │                             │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Question Difficulty Analysis                             │   │
│  │                                                         │   │
│  │ Q1: Minimum Deletions ████████████░░ 78% avg            │   │
│  │ Q2: Tree Traversal    ██████████░░░░ 65% avg            │   │
│  │ Q3: API Design        ███████░░░░░░░ 52% avg            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Freestyle Integration Architecture

### 5.1 Code Execution Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                    FREESTYLE VM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    VM Template Pool                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Node.js  │ │ Python   │ │ Java     │ │ Full     │   │   │
│  │  │ Template │ │ Template │ │ Template │ │ Stack    │   │   │
│  │  │          │ │          │ │          │ │ Template │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Candidate Session VM                        │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Isolated Environment (per candidate)           │   │   │
│  │  │                                                 │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │   │   │
│  │  │  │ Code    │  │ Test    │  │ Database        │ │   │   │
│  │  │  │ Editor  │  │ Runner  │  │ (PostgreSQL/    │ │   │   │
│  │  │  │ (Monaco)│  │         │  │  MongoDB/Redis) │ │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────────────┘ │   │   │
│  │  │                                                 │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │   │   │
│  │  │  │ Terminal│  │ Browser │  │ File System     │ │   │   │
│  │  │  │ Access  │  │ Preview │  │ (sandboxed)     │ │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────────────┘ │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  Features:                                              │   │
│  │  • Sub-second startup (<800ms)                         │   │
│  │  • Pause/Resume for time tracking                      │   │
│  │  • Fork for parallel test execution                    │   │
│  │  • Network isolation (optional)                        │   │
│  │  • Resource limits (CPU, Memory, Disk)                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Full-Stack Assignment Types

```typescript
interface FullStackAssignment {
  id: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'devops';

  // Environment Configuration
  environment: {
    // Freestyle VM config
    template: string; // e.g., 'fullstack-node-react'
    integrations: string[]; // ['node', 'postgresql', 'redis']

    // Resource limits
    cpu: number; // cores
    memory: number; // MB
    disk: number; // GB
    timeout: number; // max session time in minutes

    // Network
    networkAccess: 'full' | 'restricted' | 'none';
    allowedDomains?: string[];

    // Ports to expose
    exposedPorts: {
      port: number;
      label: string; // e.g., 'Frontend', 'API'
    }[];
  };

  // Starter code / boilerplate
  starterCode: {
    repository?: string; // Git URL to clone
    files?: {
      path: string;
      content: string;
    }[];
  };

  // Problem statement
  problemStatement: string;
  requirements: string[];

  // Evaluation
  evaluationConfig: {
    // Automated tests
    testCommand?: string;
    testTimeout?: number;

    // AI evaluation criteria
    criteria: {
      name: string;
      weight: number;
      description: string;
    }[];

    // Manual review required?
    requiresManualReview: boolean;
  };
}

// Example: Full-Stack E-commerce Feature
const exampleAssignment: FullStackAssignment = {
  id: 'fs-001',
  type: 'fullstack',
  environment: {
    template: 'fullstack-node-react',
    integrations: ['node', 'postgresql', 'redis'],
    cpu: 2,
    memory: 4096,
    disk: 10,
    timeout: 120,
    networkAccess: 'restricted',
    allowedDomains: ['npmjs.org', 'github.com'],
    exposedPorts: [
      { port: 3000, label: 'Frontend' },
      { port: 8080, label: 'API' }
    ]
  },
  starterCode: {
    repository: 'https://github.com/company/assessment-starter-ecommerce'
  },
  problemStatement: `
    Build a product review system for an e-commerce platform.

    Requirements:
    1. Create a REST API endpoint to submit reviews
    2. Implement review moderation with AI-powered sentiment analysis
    3. Build a React component to display reviews with filtering
    4. Add caching layer for frequently accessed products
  `,
  requirements: [
    'POST /api/products/:id/reviews endpoint',
    'Sentiment analysis integration',
    'React ReviewList component with filters',
    'Redis caching for product reviews'
  ],
  evaluationConfig: {
    testCommand: 'npm test',
    testTimeout: 300,
    criteria: [
      { name: 'API Design', weight: 25, description: 'RESTful conventions, error handling' },
      { name: 'Code Quality', weight: 25, description: 'Clean code, proper structure' },
      { name: 'Functionality', weight: 30, description: 'All requirements met' },
      { name: 'Performance', weight: 20, description: 'Caching, query optimization' }
    ],
    requiresManualReview: false
  }
};
```

### 5.3 VM Lifecycle Management

```typescript
interface VMSession {
  id: string;
  candidateId: string;
  assessmentId: string;
  questionId: string;

  // Freestyle VM reference
  vmId: string;
  vmStatus: 'creating' | 'running' | 'paused' | 'terminated';

  // URLs for candidate access
  urls: {
    editor: string;
    terminal: string;
    preview: string;
  };

  // Time tracking
  startedAt: Date;
  pausedAt?: Date;
  totalActiveTime: number; // seconds

  // Snapshots for evaluation
  snapshots: {
    timestamp: Date;
    reason: 'auto' | 'submit' | 'timeout';
    vmSnapshotId: string;
  }[];
}

// VM Operations
interface VMOperations {
  // Create a new VM for candidate
  createSession(config: {
    candidateId: string;
    assessmentId: string;
    questionId: string;
    template: string;
    integrations: string[];
  }): Promise<VMSession>;

  // Pause VM (for breaks, preserves state)
  pauseSession(sessionId: string): Promise<void>;

  // Resume paused VM
  resumeSession(sessionId: string): Promise<void>;

  // Fork VM for parallel test execution
  forkForTesting(sessionId: string): Promise<string>; // returns forked VM ID

  // Terminate and cleanup
  terminateSession(sessionId: string): Promise<void>;

  // Get session status
  getSessionStatus(sessionId: string): Promise<VMSession>;

  // Execute command in VM
  executeCommand(sessionId: string, command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}
```

---

## 6. AI Agent System

### 6.1 Question Generation Agent

```typescript
interface QuestionGenerationAgent {
  // Generate questions based on configuration
  generateQuestions(config: AIQuestionGenerationRequest): Promise<GeneratedQuestion[]>;

  // Validate generated questions
  validateQuestion(question: GeneratedQuestion): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }>;

  // Generate variations of a question
  generateVariations(questionId: string, count: number): Promise<GeneratedQuestion[]>;

  // Estimate difficulty
  estimateDifficulty(question: GeneratedQuestion): Promise<{
    difficulty: 'easy' | 'medium' | 'hard';
    reasoning: string;
  }>;
}

// Question Generation Prompt Template
const QUESTION_GENERATION_PROMPT = `
You are an expert technical interviewer creating assessment questions.

Context:
- Job Role: {jobRole}
- Experience Level: {experienceMin}-{experienceMax} years
- Topic: {topic}
- Question Type: {questionType}
- Difficulty: {difficulty}
- Skills to Assess: {skills}

Additional Requirements: {additionalRequirements}

Generate a {questionType} question that:
1. Is appropriate for the experience level
2. Tests the specified skills
3. Has clear input/output specifications (for coding)
4. Includes edge cases in test cases
5. Has a detailed evaluation rubric

Output Format:
{outputSchema}
`;
```

### 6.2 Evaluation Agent

```typescript
interface EvaluationAgent {
  // Evaluate code submission
  evaluateCode(submission: {
    code: string;
    language: string;
    question: GeneratedQuestion;
    testResults: TestCaseResult[];
  }): Promise<CodeEvaluation>;

  // Evaluate subjective answer
  evaluateSubjective(submission: {
    answer: string;
    question: GeneratedQuestion;
  }): Promise<SubjectiveEvaluation>;

  // Generate overall candidate feedback
  generateOverallFeedback(results: QuestionResult[]): Promise<{
    strongPoints: SkillTag[];
    areasOfImprovement: SkillTag[];
    overallFeedback: string;
    recommendation: 'strong_hire' | 'hire' | 'maybe' | 'no_hire';
  }>;
}

interface CodeEvaluation {
  // Test case results (from actual execution)
  testCasesPassed: number;
  totalTestCases: number;

  // AI evaluation
  codeQualityScore: number; // 0-100

  rubricScores: {
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }[];

  // Detailed feedback
  feedback: string;

  // Code review comments
  codeReviewComments: {
    line: number;
    type: 'suggestion' | 'issue' | 'praise';
    comment: string;
  }[];

  // Identified patterns
  patterns: {
    name: string;
    isGood: boolean;
    description: string;
  }[];
}

// Evaluation Prompt Template
const CODE_EVALUATION_PROMPT = `
You are an expert code reviewer evaluating a candidate's submission.

Question:
{questionStatement}

Expected Approach:
{expectedApproach}

Candidate's Code:
\`\`\`{language}
{code}
\`\`\`

Test Results:
- Passed: {passedTests}/{totalTests}
- Failed Cases: {failedCases}

Evaluation Rubric:
{rubric}

Evaluate the code considering:
1. Correctness - Does it solve the problem?
2. Code Quality - Is it clean, readable, well-structured?
3. Efficiency - Time and space complexity
4. Edge Cases - Are they handled?
5. Best Practices - Language-specific conventions

Provide:
1. Score for each rubric criterion
2. Detailed feedback explaining strengths and weaknesses
3. Specific code improvement suggestions
4. Overall assessment
`;
```

### 6.3 Proctoring AI Agent

```typescript
interface ProctoringAgent {
  // Real-time monitoring
  analyzeFrame(frame: {
    webcamImage: Buffer;
    timestamp: Date;
    candidateId: string;
  }): Promise<{
    faceDetected: boolean;
    multipleFaces: boolean;
    lookingAway: boolean;
    suspiciousActivity: string[];
  }>;

  // Screen monitoring
  analyzeScreen(screen: {
    screenshot: Buffer;
    activeWindow: string;
    timestamp: Date;
  }): Promise<{
    allowedApplication: boolean;
    suspiciousContent: boolean;
    violations: string[];
  }>;

  // Audio analysis (for verbal questions)
  analyzeAudio(audio: {
    buffer: Buffer;
    expectedContent?: string;
  }): Promise<{
    transcription: string;
    matchScore?: number;
    backgroundNoise: boolean;
    multipleVoices: boolean;
  }>;

  // Generate trust report
  generateTrustReport(sessionId: string): Promise<TrustScore>;
}
```

---

## 7. Technical Architecture

### 7.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │   Web Client    │     │  Mobile Client  │     │    Admin UI     │       │
│  │   (React/Next)  │     │   (React Native)│     │   (React/Next)  │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   │                                         │
│                                   ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        API Gateway (Kong/AWS)                        │   │
│  │                    Authentication / Rate Limiting                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                         │
│           ┌───────────────────────┼───────────────────────┐                 │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Assessment     │     │  Execution      │     │  Evaluation     │       │
│  │  Service        │     │  Service        │     │  Service        │       │
│  │  (Node.js)      │     │  (Node.js)      │     │  (Python)       │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           │              ┌────────┴────────┐              │                 │
│           │              │                 │              │                 │
│           │              ▼                 ▼              │                 │
│           │     ┌─────────────┐   ┌─────────────┐        │                 │
│           │     │ Freestyle   │   │ Freestyle   │        │                 │
│           │     │ VMs         │   │ Serverless  │        │                 │
│           │     │ (Full-Stack)│   │ Runs (Quick)│        │                 │
│           │     └─────────────┘   └─────────────┘        │                 │
│           │                                               │                 │
│           │              ┌────────────────────────────────┘                 │
│           │              │                                                  │
│           ▼              ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AI Agent Orchestrator                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Question Gen │  │ Evaluation   │  │ Proctoring   │              │   │
│  │  │ Agent        │  │ Agent        │  │ Agent        │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                         │
│                                   ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           Data Layer                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ PostgreSQL   │  │ Redis        │  │ S3/MinIO     │              │   │
│  │  │ (Primary DB) │  │ (Cache/Queue)│  │ (Files/Media)│              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Database Schema

```sql
-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'admin', 'hiring_manager', 'interviewer'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Assessments
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    title VARCHAR(255) NOT NULL,
    job_designation VARCHAR(255) NOT NULL,
    experience_min INTEGER,
    experience_max INTEGER,
    skills TEXT[],
    status VARCHAR(50) DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    schedule JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Questions (AI Generated or Manual)
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES assessments(id),
    topic VARCHAR(255) NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    problem_statement TEXT NOT NULL,
    input_format TEXT,
    output_format TEXT,
    examples JSONB,
    constraints TEXT[],
    test_cases JSONB, -- Hidden from candidates
    evaluation_rubric JSONB,
    max_marks INTEGER NOT NULL,
    estimated_time INTEGER, -- minutes
    sequence_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Candidates
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    resume_url TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Assessment Invitations
CREATE TABLE assessment_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES assessments(id),
    candidate_id UUID REFERENCES candidates(id),
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, started, completed
    invited_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(assessment_id, candidate_id)
);

-- Submissions
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID REFERENCES assessment_invitations(id),
    question_id UUID REFERENCES questions(id),
    submission_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL, -- code, answer, etc.
    time_taken INTEGER, -- seconds
    submitted_at TIMESTAMP DEFAULT NOW()
);

-- Evaluations
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id),
    marks_obtained DECIMAL(5,2),
    feedback TEXT,
    rubric_scores JSONB,
    test_results JSONB,
    ai_analysis JSONB,
    evaluated_at TIMESTAMP DEFAULT NOW()
);

-- Proctoring Events
CREATE TABLE proctoring_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID REFERENCES assessment_invitations(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- VM Sessions (Freestyle)
CREATE TABLE vm_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID REFERENCES assessment_invitations(id),
    question_id UUID REFERENCES questions(id),
    freestyle_vm_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'creating',
    urls JSONB,
    started_at TIMESTAMP,
    paused_at TIMESTAMP,
    total_active_time INTEGER DEFAULT 0,
    terminated_at TIMESTAMP
);
```

### 7.3 API Endpoints

```yaml
# Assessment Management
POST   /api/v1/assessments                    # Create assessment
GET    /api/v1/assessments                    # List assessments
GET    /api/v1/assessments/:id                # Get assessment details
PUT    /api/v1/assessments/:id                # Update assessment
DELETE /api/v1/assessments/:id                # Delete assessment
POST   /api/v1/assessments/:id/publish        # Publish assessment
POST   /api/v1/assessments/:id/clone          # Clone assessment

# Question Management
POST   /api/v1/assessments/:id/questions/generate    # AI generate questions
GET    /api/v1/assessments/:id/questions             # List questions
POST   /api/v1/assessments/:id/questions             # Add manual question
PUT    /api/v1/questions/:id                         # Update question
DELETE /api/v1/questions/:id                         # Delete question
POST   /api/v1/questions/:id/preview                 # Preview question

# Candidate Management
POST   /api/v1/assessments/:id/candidates            # Add candidates
POST   /api/v1/assessments/:id/candidates/bulk       # Bulk upload (CSV)
DELETE /api/v1/assessments/:id/candidates/:candidateId
POST   /api/v1/assessments/:id/send-invitations      # Send invites

# Candidate Experience (Public)
GET    /api/v1/take/:token                           # Get assessment by token
POST   /api/v1/take/:token/start                     # Start assessment
GET    /api/v1/take/:token/questions/:qid            # Get question
POST   /api/v1/take/:token/questions/:qid/submit     # Submit answer
POST   /api/v1/take/:token/complete                  # Complete assessment

# VM Sessions (Freestyle)
POST   /api/v1/sessions/create                       # Create VM session
POST   /api/v1/sessions/:id/pause                    # Pause session
POST   /api/v1/sessions/:id/resume                   # Resume session
POST   /api/v1/sessions/:id/execute                  # Execute command
POST   /api/v1/sessions/:id/terminate                # Terminate session
GET    /api/v1/sessions/:id/status                   # Get session status

# Reports & Analytics
GET    /api/v1/assessments/:id/report                # Assessment report
GET    /api/v1/assessments/:id/candidates/:cid/report # Candidate report
GET    /api/v1/assessments/:id/analytics             # Assessment analytics
GET    /api/v1/dashboard/metrics                     # Dashboard metrics

# Proctoring
POST   /api/v1/proctoring/frame                      # Submit webcam frame
POST   /api/v1/proctoring/screen                     # Submit screenshot
GET    /api/v1/proctoring/:invitationId/report       # Get trust report

# Organization
GET    /api/v1/organization/settings                 # Get settings
PUT    /api/v1/organization/settings                 # Update settings
```

---

## 8. Freestyle VM Templates

### 8.1 Pre-built Templates

```typescript
const VM_TEMPLATES = {
  // Basic language templates
  'node-basic': {
    description: 'Node.js environment for JavaScript/TypeScript coding',
    integrations: ['node'],
    defaultPorts: [{ port: 3000, label: 'App' }],
    starterFiles: {
      'index.js': '// Your code here\n',
      'package.json': '{"name":"assessment","version":"1.0.0"}'
    }
  },

  'python-basic': {
    description: 'Python environment for coding challenges',
    integrations: ['python'],
    defaultPorts: [],
    starterFiles: {
      'main.py': '# Your code here\n',
      'requirements.txt': ''
    }
  },

  'java-basic': {
    description: 'Java environment with JDK',
    integrations: ['java'],
    defaultPorts: [],
    starterFiles: {
      'Main.java': 'public class Main {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}'
    }
  },

  // Full-stack templates
  'fullstack-node-react': {
    description: 'Full-stack with Node.js backend and React frontend',
    integrations: ['node', 'postgresql', 'redis'],
    defaultPorts: [
      { port: 3000, label: 'Frontend' },
      { port: 8080, label: 'API' }
    ],
    starterFiles: {
      // Pre-configured monorepo structure
    }
  },

  'fullstack-python-django': {
    description: 'Full-stack with Django and PostgreSQL',
    integrations: ['python', 'postgresql'],
    defaultPorts: [
      { port: 8000, label: 'Django' }
    ]
  },

  // Specialized templates
  'ml-python': {
    description: 'Python with ML libraries (numpy, pandas, sklearn, pytorch)',
    integrations: ['python'],
    preinstalledPackages: ['numpy', 'pandas', 'scikit-learn', 'torch']
  },

  'devops': {
    description: 'DevOps environment with Docker, Kubernetes tools',
    integrations: ['node', 'docker'],
    defaultPorts: []
  }
};
```

### 8.2 Freestyle Integration Code

```typescript
import { Freestyle } from '@anthropic/freestyle-sdk';

class FreestyleVMService {
  private client: Freestyle;

  constructor() {
    this.client = new Freestyle({
      apiKey: process.env.FREESTYLE_API_KEY
    });
  }

  async createAssessmentVM(config: {
    template: string;
    candidateId: string;
    questionId: string;
    timeoutMinutes: number;
  }): Promise<VMSession> {
    const templateConfig = VM_TEMPLATES[config.template];

    // Create VM with template
    const vm = await this.client.vms.create({
      template: config.template,
      integrations: templateConfig.integrations,

      // Resource limits for assessment
      cpu: 2,
      memory: 4096, // 4GB
      disk: 10240,  // 10GB

      // Network restrictions
      network: {
        mode: 'restricted',
        allowedDomains: ['npmjs.org', 'pypi.org', 'github.com']
      },

      // Exposed ports
      ports: templateConfig.defaultPorts.map(p => p.port),

      // Auto-terminate after timeout
      timeout: config.timeoutMinutes * 60 * 1000,

      // Metadata for tracking
      metadata: {
        candidateId: config.candidateId,
        questionId: config.questionId,
        type: 'assessment'
      }
    });

    // Wait for VM to be ready
    await vm.waitUntilReady();

    // Get access URLs
    const urls = {
      editor: `https://editor.freestyle.sh/vm/${vm.id}`,
      terminal: `https://terminal.freestyle.sh/vm/${vm.id}`,
      preview: templateConfig.defaultPorts.map(p => ({
        label: p.label,
        url: `https://${vm.id}-${p.port}.preview.freestyle.sh`
      }))
    };

    return {
      id: generateId(),
      vmId: vm.id,
      vmStatus: 'running',
      urls,
      startedAt: new Date(),
      totalActiveTime: 0,
      snapshots: []
    };
  }

  async pauseVM(vmId: string): Promise<void> {
    await this.client.vms.pause(vmId);
  }

  async resumeVM(vmId: string): Promise<void> {
    await this.client.vms.resume(vmId);
  }

  async executeTests(vmId: string, testCommand: string): Promise<TestResult[]> {
    // Fork the VM for isolated test execution
    const testVm = await this.client.vms.fork(vmId);

    try {
      // Run tests in forked VM
      const result = await this.client.vms.execute(testVm.id, {
        command: testCommand,
        timeout: 300000 // 5 minutes
      });

      return this.parseTestResults(result.stdout);
    } finally {
      // Cleanup forked VM
      await this.client.vms.terminate(testVm.id);
    }
  }

  async createSnapshot(vmId: string): Promise<string> {
    const snapshot = await this.client.vms.snapshot(vmId);
    return snapshot.id;
  }

  async terminateVM(vmId: string): Promise<void> {
    await this.client.vms.terminate(vmId);
  }
}
```

---

## 9. Proctoring System

### 9.1 Trust Score Calculation

```typescript
interface TrustScoreCalculator {
  calculateScore(events: ProctoringEvent[]): TrustScore;
}

const TRUST_SCORE_WEIGHTS = {
  tabSwitched: -5,        // per occurrence
  outOfFrame: -3,         // per occurrence
  clickedOutsideWindow: -2,
  multipleFacesDetected: -10,
  externalMonitorDetected: -15, // one-time
  fullscreenExited: -8,   // one-time
  extensionDetected: -20, // one-time (suspicious extensions)
  ipMismatch: -5,         // per occurrence
  vpnDetected: -10        // one-time
};

function calculateTrustScore(violations: TrustViolations): number {
  let score = 100;

  score += violations.tabSwitched * TRUST_SCORE_WEIGHTS.tabSwitched;
  score += violations.outOfFrame * TRUST_SCORE_WEIGHTS.outOfFrame;
  score += violations.clickedOutsideWindow * TRUST_SCORE_WEIGHTS.clickedOutsideWindow;
  score += violations.multipleFacesDetected * TRUST_SCORE_WEIGHTS.multipleFacesDetected;

  if (violations.externalMonitorDetected) {
    score += TRUST_SCORE_WEIGHTS.externalMonitorDetected;
  }
  if (violations.fullscreenExited) {
    score += TRUST_SCORE_WEIGHTS.fullscreenExited;
  }
  if (violations.extensionDetected) {
    score += TRUST_SCORE_WEIGHTS.extensionDetected;
  }

  score += violations.ipMismatch * TRUST_SCORE_WEIGHTS.ipMismatch;

  return Math.max(0, Math.min(100, score));
}
```

### 9.2 Proctoring Features

| Feature | Description | Detection Method |
|---------|-------------|------------------|
| Face Detection | Verify candidate is present | AI face detection on webcam |
| Multiple Faces | Detect if someone else is helping | Multi-face detection |
| Tab Switching | Track if candidate switches tabs | Page visibility API |
| Out of Frame | Candidate looking away/leaving | Face position tracking |
| External Monitor | Additional displays connected | Screen enumeration API |
| Fullscreen Exit | Candidate exits fullscreen mode | Fullscreen API events |
| Extension Detection | Detect suspicious browser extensions | Extension enumeration |
| IP Monitoring | Track IP changes during session | IP logging |
| Copy/Paste Tracking | Monitor clipboard usage | Clipboard events |
| Audio Monitoring | Detect background voices | Audio analysis |

---

## 10. Email Templates

### 10.1 Invitation Email
```html
Subject: You're invited to complete a technical assessment for {JobRole} at {Company}

Dear {CandidateName},

You have been invited to complete a technical assessment for the {JobRole} position at {Company}.

Assessment Details:
- Assessment: {AssessmentTitle}
- Duration: Approximately {EstimatedTime}
- Deadline: {Deadline}
- Attempts Allowed: {Attempts}

What to Expect:
{QuestionTypeSummary}

Before You Begin:
✓ Ensure stable internet connection
✓ Use Chrome or Firefox browser
✓ Have your webcam ready (proctoring enabled)
✓ Find a quiet environment
✓ Keep {Duration} of uninterrupted time

[Start Assessment]

If you have any questions, please contact {SupportEmail}.

Best regards,
{Company} Hiring Team
```

### 10.2 Feedback Report Email
```html
Subject: Your Assessment Results for {JobRole} at {Company}

Dear {CandidateName},

Thank you for completing the technical assessment for {JobRole} at {Company}.

Your Results:
- Overall Score: {ScorePercentage}%
- Time Taken: {TimeTaken}

Strong Areas:
{StrongPointsList}

Areas for Growth:
{ImprovementAreasList}

Feedback:
{OverallFeedback}

[View Detailed Report]

Thank you for your interest in {Company}.

Best regards,
{Company} Hiring Team
```

---

## 11. Implementation Phases

### Phase 1: Core Assessment Platform
- Dashboard with metrics
- Assessment CRUD operations
- 5-step assessment wizard (without AI)
- Manual question creation
- Candidate management
- Basic reporting

### Phase 2: AI Question Generation
- Integration with AI agents
- Skill-based question generation
- Question validation and preview
- Difficulty estimation
- Question bank management

### Phase 3: Freestyle VM Integration
- Basic code execution (single language)
- VM session management
- Test case execution
- Code submission handling

### Phase 4: Full-Stack Assignments
- Multi-language support
- Database integrations
- Full-stack templates
- Real-time preview
- Collaborative features

### Phase 5: AI Evaluation
- Automated code evaluation
- Subjective answer evaluation
- Detailed feedback generation
- Strong points/improvement areas analysis
- Hiring recommendations

### Phase 6: Advanced Proctoring
- Real-time face detection
- Tab/window monitoring
- Trust score calculation
- Recording and playback
- Violation alerts

### Phase 7: Analytics & Insights
- Advanced analytics dashboard
- Comparative analysis
- Skill gap identification
- Hiring funnel optimization
- Custom report builder

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Assessment Creation Time | < 15 minutes | Time from start to publish |
| Question Generation Accuracy | > 90% | % of AI questions accepted without edits |
| VM Startup Time | < 2 seconds | Time to running VM |
| Evaluation Accuracy | > 85% | Agreement with human reviewers |
| Candidate Completion Rate | > 80% | % who finish started assessments |
| Trust Score Accuracy | > 95% | False positive/negative rate |
| Time to Hire | -30% | Reduction in hiring cycle |
| Recruiter Time Saved | 60% | Hours saved per hire |

---

## 13. Security Considerations

### 13.1 Data Security
- All data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- PII data anonymization for analytics
- GDPR/CCPA compliance
- Regular security audits

### 13.2 Assessment Integrity
- Randomized question order
- Question pooling (multiple variants)
- Time-bound access tokens
- IP-based restrictions (optional)
- Proctoring evidence retention

### 13.3 VM Security
- Network isolation between candidate VMs
- Resource limits to prevent abuse
- No persistence between sessions
- Automatic cleanup on termination
- Audit logging of all operations

---

## 14. Appendix

### 14.1 Supported Programming Languages
- JavaScript/TypeScript (Node.js, Bun)
- Python (3.x)
- Java (JDK 17+)
- C/C++
- Go
- Rust
- Ruby
- PHP
- C#/.NET

### 14.2 Supported Databases (Full-Stack)
- PostgreSQL
- MySQL
- MongoDB
- Redis
- SQLite

### 14.3 Supported Frameworks
- React, Vue, Angular (Frontend)
- Express, Fastify, NestJS (Node.js Backend)
- Django, FastAPI, Flask (Python Backend)
- Spring Boot (Java Backend)

---

*Document Version: 1.0*
*Last Updated: January 3, 2026*
*Author: Product Team*
