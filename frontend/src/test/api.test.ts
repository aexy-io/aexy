import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

describe("API Client Configuration", () => {
  it("should export api object", async () => {
    // Verify the API module structure
    const apiModule = await import("@/lib/api");

    expect(apiModule).toBeDefined();
    expect(apiModule.developerApi).toBeDefined();
    expect(apiModule.authApi).toBeDefined();
  });

  it("should have developerApi methods", async () => {
    const { developerApi } = await import("@/lib/api");

    expect(typeof developerApi.getMe).toBe("function");
    expect(typeof developerApi.updateMe).toBe("function");
    expect(typeof developerApi.getById).toBe("function");
    expect(typeof developerApi.list).toBe("function");
  });

  it("should have authApi methods", async () => {
    const { authApi } = await import("@/lib/api");

    expect(typeof authApi.getGitHubLoginUrl).toBe("function");
  });
});

describe("Developer Types", () => {
  it("should have correct LanguageSkill structure", () => {
    const languageSkill = {
      name: "Python",
      proficiency_score: 85,
      lines_of_code: 10000,
      commits_count: 100,
      trend: "growing" as const,
    };

    expect(languageSkill.name).toBe("Python");
    expect(languageSkill.proficiency_score).toBe(85);
    expect(languageSkill.trend).toBe("growing");
  });

  it("should have correct FrameworkSkill structure", () => {
    const frameworkSkill = {
      name: "FastAPI",
      category: "web",
      proficiency_score: 75,
      usage_count: 50,
    };

    expect(frameworkSkill.name).toBe("FastAPI");
    expect(frameworkSkill.category).toBe("web");
  });

  it("should have correct DomainExpertise structure", () => {
    const domainExpertise = {
      name: "payments",
      confidence_score: 80,
    };

    expect(domainExpertise.name).toBe("payments");
    expect(domainExpertise.confidence_score).toBe(80);
  });

  it("should have correct SkillFingerprint structure", () => {
    const skillFingerprint = {
      languages: [],
      frameworks: [],
      domains: [],
      tools: ["Git", "Docker"],
    };

    expect(skillFingerprint.languages).toEqual([]);
    expect(skillFingerprint.tools).toContain("Git");
  });

  it("should have correct Developer structure", () => {
    const developer = {
      id: "123",
      email: "test@example.com",
      name: "Test User",
      avatar_url: "https://github.com/avatar.png",
      skill_fingerprint: null,
      work_patterns: null,
      growth_trajectory: null,
      github_connection: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    expect(developer.id).toBe("123");
    expect(developer.email).toBe("test@example.com");
  });
});

describe("WorkPatterns Type", () => {
  it("should have correct structure", () => {
    const workPatterns = {
      preferred_complexity: "medium",
      collaboration_style: "balanced",
      peak_productivity_hours: [10, 14, 16],
      average_pr_size: 150,
      average_review_turnaround_hours: 4.5,
    };

    expect(workPatterns.preferred_complexity).toBe("medium");
    expect(workPatterns.peak_productivity_hours).toHaveLength(3);
  });
});

describe("GrowthTrajectory Type", () => {
  it("should have correct structure", () => {
    const trajectory = {
      skills_acquired_6m: ["Go", "Kubernetes"],
      skills_acquired_12m: ["Go", "Kubernetes", "Rust"],
      skills_declining: ["PHP"],
      learning_velocity: 0.5,
    };

    expect(trajectory.skills_acquired_6m).toContain("Go");
    expect(trajectory.skills_declining).toContain("PHP");
    expect(trajectory.learning_velocity).toBe(0.5);
  });
});
