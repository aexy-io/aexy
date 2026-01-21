"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface OnboardingData {
  useCases: string[];
  // Workspace info
  workspace: {
    id: string | null;
    name: string | null;
    type: "create" | "join" | null;
    joinRequestStatus: "none" | "pending" | "accepted" | "rejected";
  };
  connections: {
    github: boolean;
    google: boolean;
    jira: boolean;
    linear: boolean;
    slack: boolean;
  };
  githubRepos: string[];
  googleSettings: {
    gmail: boolean;
    calendar: boolean;
    autoCreateContacts: boolean;
    enrichWithAI: boolean;
  };
  invitedEmails: string[];
}

interface OnboardingContextType {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  updateWorkspace: (updates: Partial<OnboardingData["workspace"]>) => void;
  updateConnections: (updates: Partial<OnboardingData["connections"]>) => void;
  updateGoogleSettings: (updates: Partial<OnboardingData["googleSettings"]>) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  totalSteps: number;
  getNextRoute: () => string;
  resetOnboarding: () => void;
}

const defaultData: OnboardingData = {
  useCases: [],
  workspace: {
    id: null,
    name: null,
    type: null,
    joinRequestStatus: "none",
  },
  connections: {
    github: false,
    google: false,
    jira: false,
    linear: false,
    slack: false,
  },
  githubRepos: [],
  googleSettings: {
    gmail: true,
    calendar: true,
    autoCreateContacts: true,
    enrichWithAI: true,
  },
  invitedEmails: [],
};

const STORAGE_KEY = "aexy_onboarding_data";

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [currentStep, setCurrentStep] = useState(1);
  const [isHydrated, setIsHydrated] = useState(false);
  const totalSteps = 7; // Welcome, Use Case, Workspace, Connect, Repos/Gmail, Invite, Complete

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setData({ ...defaultData, ...parsed });
      } catch {
        // Invalid data, use defaults
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isHydrated]);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const updateWorkspace = (updates: Partial<OnboardingData["workspace"]>) => {
    setData(prev => ({
      ...prev,
      workspace: { ...prev.workspace, ...updates },
    }));
  };

  const updateConnections = (updates: Partial<OnboardingData["connections"]>) => {
    setData(prev => ({
      ...prev,
      connections: { ...prev.connections, ...updates },
    }));
  };

  const updateGoogleSettings = (updates: Partial<OnboardingData["googleSettings"]>) => {
    setData(prev => ({
      ...prev,
      googleSettings: { ...prev.googleSettings, ...updates },
    }));
  };

  const resetOnboarding = () => {
    setData(defaultData);
    setCurrentStep(1);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Determine next route after connections page
  const getNextRoute = (): string => {
    const { connections } = data;

    // After connect page, go to first applicable config page
    if (connections.github) {
      return "/onboarding/repos";
    }
    if (connections.google) {
      return "/onboarding/gmail-settings";
    }
    // No connections that need config, go to invite
    return "/onboarding/invite";
  };

  return (
    <OnboardingContext.Provider
      value={{
        data,
        updateData,
        updateWorkspace,
        updateConnections,
        updateGoogleSettings,
        currentStep,
        setCurrentStep,
        totalSteps,
        getNextRoute,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
