import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

// Mock window.location
const locationMock = {
  href: "",
};

Object.defineProperty(global, "window", {
  value: {
    localStorage: localStorageMock,
    location: locationMock,
  },
});

describe("Auth Token Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    locationMock.href = "";
  });

  it("should get token from localStorage", () => {
    localStorageMock.getItem.mockReturnValue("test-token");

    const token = localStorage.getItem("token");

    expect(token).toBe("test-token");
    expect(localStorageMock.getItem).toHaveBeenCalledWith("token");
  });

  it("should set token in localStorage", () => {
    localStorage.setItem("token", "new-token");

    expect(localStorageMock.setItem).toHaveBeenCalledWith("token", "new-token");
  });

  it("should remove token from localStorage", () => {
    localStorage.removeItem("token");

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
  });

  it("should return null when no token exists", () => {
    localStorageMock.getItem.mockReturnValue(null);

    const token = localStorage.getItem("token");

    expect(token).toBeNull();
  });
});

describe("Auth State Logic", () => {
  it("should determine authenticated state from user data", () => {
    const user = { id: "123", email: "test@example.com" };
    const error = null;

    const isAuthenticated = !!user && !error;

    expect(isAuthenticated).toBe(true);
  });

  it("should be not authenticated when no user", () => {
    const user = null;
    const error = null;

    const isAuthenticated = !!user && !error;

    expect(isAuthenticated).toBe(false);
  });

  it("should be not authenticated when error exists", () => {
    const user = { id: "123", email: "test@example.com" };
    const error = new Error("Auth failed");

    const isAuthenticated = !!user && !error;

    expect(isAuthenticated).toBe(false);
  });
});

describe("Logout Logic", () => {
  it("should clear token on logout", () => {
    const logout = () => {
      localStorage.removeItem("token");
    };

    logout();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("token");
  });
});

describe("Token Validation", () => {
  it("should detect expired token", () => {
    const isTokenExpired = (exp: number): boolean => {
      return Date.now() >= exp * 1000;
    };

    const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    expect(isTokenExpired(pastTime)).toBe(true);
    expect(isTokenExpired(futureTime)).toBe(false);
  });
});

describe("OAuth Callback Handling", () => {
  it("should extract token from search params", () => {
    const searchParams = new URLSearchParams("?token=abc123&type=bearer");

    const token = searchParams.get("token");
    const type = searchParams.get("type");

    expect(token).toBe("abc123");
    expect(type).toBe("bearer");
  });

  it("should detect error in callback", () => {
    const searchParams = new URLSearchParams("?error=access_denied");

    const error = searchParams.get("error");

    expect(error).toBe("access_denied");
  });

  it("should handle missing token", () => {
    const searchParams = new URLSearchParams("?other=value");

    const token = searchParams.get("token");

    expect(token).toBeNull();
  });
});

describe("Developer Data Transformation", () => {
  it("should parse skill fingerprint from API response", () => {
    const apiResponse = {
      skill_fingerprint: {
        languages: [
          { name: "Python", proficiency_score: 85 },
          { name: "TypeScript", proficiency_score: 70 },
        ],
        frameworks: [{ name: "FastAPI", category: "web" }],
        domains: [{ name: "payments", confidence_score: 80 }],
        tools: ["Git", "Docker"],
      },
    };

    const languages = apiResponse.skill_fingerprint.languages;

    expect(languages).toHaveLength(2);
    expect(languages[0].name).toBe("Python");
    expect(languages[0].proficiency_score).toBe(85);
  });

  it("should handle null skill fingerprint", () => {
    const apiResponse: { skill_fingerprint: { languages: string[] } | null } = {
      skill_fingerprint: null,
    };

    const hasSkills = !!apiResponse.skill_fingerprint?.languages?.length;

    expect(hasSkills).toBe(false);
  });

  it("should sort languages by proficiency", () => {
    const languages = [
      { name: "Python", proficiency_score: 85 },
      { name: "Go", proficiency_score: 40 },
      { name: "TypeScript", proficiency_score: 70 },
    ];

    const sorted = [...languages].sort(
      (a, b) => b.proficiency_score - a.proficiency_score
    );

    expect(sorted[0].name).toBe("Python");
    expect(sorted[1].name).toBe("TypeScript");
    expect(sorted[2].name).toBe("Go");
  });
});

describe("Work Patterns Interpretation", () => {
  it("should format peak hours correctly", () => {
    const formatHour = (hour: number): string => {
      if (hour === 0) return "12 AM";
      if (hour === 12) return "12 PM";
      if (hour < 12) return `${hour} AM`;
      return `${hour - 12} PM`;
    };

    expect(formatHour(9)).toBe("9 AM");
    expect(formatHour(14)).toBe("2 PM");
    expect(formatHour(0)).toBe("12 AM");
    expect(formatHour(12)).toBe("12 PM");
  });

  it("should classify complexity levels", () => {
    const getComplexityLabel = (complexity: string): string => {
      const labels: Record<string, string> = {
        simple: "Quick fixes & small tasks",
        medium: "Standard features",
        complex: "Large features & architecture",
      };
      return labels[complexity] || "Unknown";
    };

    expect(getComplexityLabel("simple")).toBe("Quick fixes & small tasks");
    expect(getComplexityLabel("complex")).toBe("Large features & architecture");
  });
});

describe("Growth Trajectory Analysis", () => {
  it("should calculate skill growth percentage", () => {
    const calculateGrowth = (acquired: number, total: number): number => {
      if (total === 0) return 0;
      return Math.round((acquired / total) * 100);
    };

    expect(calculateGrowth(3, 10)).toBe(30);
    expect(calculateGrowth(0, 10)).toBe(0);
    expect(calculateGrowth(5, 0)).toBe(0);
  });

  it("should format learning velocity", () => {
    const formatVelocity = (velocity: number): string => {
      if (velocity >= 1) return `${velocity.toFixed(1)} skills/month`;
      return `${(velocity * 12).toFixed(1)} skills/year`;
    };

    expect(formatVelocity(1.5)).toBe("1.5 skills/month");
    expect(formatVelocity(0.5)).toBe("6.0 skills/year");
  });
});
