import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Return the useful message from FastAPI validation responses instead of the
 * generic Axios status message. Automation validation uses both a plain
 * string and an object with a message plus per-field errors.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const detail = (
    error as {
      response?: {
        data?: {
          detail?: unknown;
        };
      };
    }
  )?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (detail && typeof detail === "object") {
    const firstError = (detail as { errors?: unknown }).errors;
    if (Array.isArray(firstError)) {
      const firstMessage = firstError[0]?.message;
      if (typeof firstMessage === "string" && firstMessage.trim()) {
        return firstMessage;
      }
    }

    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Turns known automation test failures into the next useful action.
 * The backend intentionally returns a short reason; the builder adds
 * the context a person needs to correct the test input.
 */
export function getTestFailureMessage(message?: string): string | undefined {
  if (message === "No recipient email address") {
    return "The automation is saved. This test needs a real CRM record with an email address, because the recipient is taken from that record. Enter its Record ID and run the test again.";
  }

  return message;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === 0) return "-";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}hr`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}
