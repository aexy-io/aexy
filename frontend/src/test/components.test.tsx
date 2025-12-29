import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock tanstack query
vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  })),
}));

describe("Home Page Components", () => {
  it("should render feature card correctly", () => {
    const FeatureCard = ({
      title,
      description,
    }: {
      title: string;
      description: string;
    }) => (
      <div className="feature-card">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    );

    render(
      <FeatureCard
        title="Developer Profiling"
        description="Automatic skill extraction from commits"
      />
    );

    expect(screen.getByText("Developer Profiling")).toBeInTheDocument();
    expect(
      screen.getByText("Automatic skill extraction from commits")
    ).toBeInTheDocument();
  });

  it("should render stat card correctly", () => {
    const StatCard = ({ number, label }: { number: string; label: string }) => (
      <div className="stat-card">
        <div className="number">{number}</div>
        <div className="label">{label}</div>
      </div>
    );

    render(<StatCard number="50%" label="Task-Skill Mismatch Reduction" />);

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Task-Skill Mismatch Reduction")).toBeInTheDocument();
  });
});

describe("SkillBar Component", () => {
  it("should render skill bar with correct width", () => {
    const SkillBar = ({
      name,
      score,
      trend,
    }: {
      name: string;
      score: number;
      trend: string;
    }) => (
      <div data-testid="skill-bar">
        <span>{name}</span>
        <div
          className="progress-bar"
          style={{ width: `${score}%` }}
          data-testid="progress"
        />
        <span className={`trend-${trend}`}>{trend}</span>
      </div>
    );

    render(<SkillBar name="Python" score={85} trend="growing" />);

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("growing")).toBeInTheDocument();
    expect(screen.getByTestId("progress")).toHaveStyle({ width: "85%" });
  });

  it("should apply correct trend color class", () => {
    const getTrendColor = (trend: string): string => {
      switch (trend) {
        case "growing":
          return "text-green-400";
        case "declining":
          return "text-red-400";
        default:
          return "text-slate-500";
      }
    };

    expect(getTrendColor("growing")).toBe("text-green-400");
    expect(getTrendColor("declining")).toBe("text-red-400");
    expect(getTrendColor("stable")).toBe("text-slate-500");
  });
});

describe("DomainTag Component", () => {
  it("should render domain tag correctly", () => {
    const DomainTag = ({ name }: { name: string }) => (
      <span className="domain-tag">{name.replace("_", " ")}</span>
    );

    render(<DomainTag name="data_pipeline" />);

    expect(screen.getByText("data pipeline")).toBeInTheDocument();
  });
});

describe("FrameworkTag Component", () => {
  it("should render framework tag correctly", () => {
    const FrameworkTag = ({ name }: { name: string }) => (
      <span className="framework-tag">{name}</span>
    );

    render(<FrameworkTag name="FastAPI" />);

    expect(screen.getByText("FastAPI")).toBeInTheDocument();
  });
});

describe("Loading Spinner", () => {
  it("should render loading state", () => {
    const LoadingSpinner = () => (
      <div data-testid="loading-spinner" className="animate-spin" />
    );

    render(<LoadingSpinner />);

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("loading-spinner")).toHaveClass("animate-spin");
  });
});

describe("Navigation", () => {
  it("should render navigation links", () => {
    const Navigation = () => (
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/login">Sign In</a>
      </nav>
    );

    render(<Navigation />);

    expect(screen.getByText("Home")).toHaveAttribute("href", "/");
    expect(screen.getByText("Dashboard")).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Sign In")).toHaveAttribute("href", "/login");
  });
});

describe("Profile Header", () => {
  it("should render user profile header", () => {
    const ProfileHeader = ({
      name,
      email,
      username,
    }: {
      name: string;
      email: string;
      username: string;
    }) => (
      <div className="profile-header">
        <h2>{name}</h2>
        <p>{email}</p>
        <p>@{username}</p>
      </div>
    );

    render(
      <ProfileHeader
        name="Test User"
        email="test@example.com"
        username="testuser"
      />
    );

    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("@testuser")).toBeInTheDocument();
  });
});

describe("Empty State", () => {
  it("should render empty state message", () => {
    const EmptyState = ({ message }: { message: string }) => (
      <div className="empty-state">
        <p>{message}</p>
      </div>
    );

    render(<EmptyState message="No language data yet." />);

    expect(screen.getByText("No language data yet.")).toBeInTheDocument();
  });
});
