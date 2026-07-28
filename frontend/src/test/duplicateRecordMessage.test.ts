import { describe, expect, it } from "vitest";

import { getApiErrorMessage } from "@/lib/utils";

describe("duplicate record conflict", () => {
  // Exactly what the backend returns on a unique-attribute violation.
  const conflict = {
    message: "Request failed with status code 409",
    response: {
      status: 409,
      data: {
        detail:
          "A record with email = 'SAMX1@gmail.com' already exists (record a90dc76f-0e28-4c8d-960f-22cac300e734)",
        field: "email",
        existing_record_id: "a90dc76f-0e28-4c8d-960f-22cac300e734",
      },
    },
  };

  it("shows the reason, not the status code", () => {
    const shown = getApiErrorMessage(conflict, "Failed to create record");

    expect(shown).toContain("already exists");
    expect(shown).not.toContain("status code");
  });
});
