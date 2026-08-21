/**
 * Editing the buckets a ticket can be pending with.
 *
 * The backend has had CRUD on this table since `PendingWith` stopped being an
 * enum, and nothing rendered it — so a desk seeded from the insurance template
 * had KAM, Insurer and Partner and no way to add Tech or Product, which is also
 * why an engineering board had nowhere to hand a ticket to.
 *
 * What is worth asserting is the part an admin can get wrong silently: saving an
 * internal bucket with no owning department produces a bucket that routes
 * nowhere and looks finished, and the only symptom is a queue that stays empty.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StakeholdersSection } from "@/components/settings/service-desk/StakeholdersSection";
import type { Stakeholder } from "@/lib/service-desk-api";

const updateStakeholder = { mutate: vi.fn(), isPending: false };
const createStakeholder = { mutate: vi.fn(), isPending: false };
const deleteStakeholder = { mutate: vi.fn(), isPending: false };

let stakeholders: Stakeholder[] = [];
let departments: { id: string; name: string; function_key: string | null }[] = [];

vi.mock("@/hooks/useServiceDesk", () => ({
  useServiceDeskTaxonomy: () => ({ stakeholders, isLoading: false }),
  useServiceDeskSettings: () => ({ data: { can_manage: true } }),
  useServiceDeskMutations: () => ({ updateStakeholder, createStakeholder, deleteStakeholder }),
}));

vi.mock("@/hooks/useOrganization", () => ({
  useDepartments: () => ({ data: departments }),
}));

function bucket(overrides: Partial<Stakeholder> & { slug: string }): Stakeholder {
  return {
    id: `id-${overrides.slug}`,
    workspace_id: "ws-1",
    label: overrides.slug,
    semantics: "internal",
    function_key: "operations",
    links_to: null,
    position: 0,
    is_active: true,
    ...overrides,
  } as Stakeholder;
}

function renderSection() {
  render(<StakeholdersSection />);
}

describe("StakeholdersSection", () => {
  it("says an internal bucket has nothing to own it before the form is used", () => {
    // The fix is on a different page, so discovering this after a failed save
    // means backtracking out of settings entirely.
    stakeholders = [];
    departments = [{ id: "d1", name: "Operations", function_key: null }];
    renderSection();

    expect(screen.getByText(/No department has a function assigned/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /org chart/i })).toHaveAttribute(
      "href",
      "/organization/departments",
    );
  });

  it("will not add an internal bucket until a department owns it", () => {
    stakeholders = [];
    departments = [{ id: "d1", name: "Engineering", function_key: "engineering" }];
    renderSection();

    const add = screen.getByTestId("new-stakeholder-add");
    expect(add).toBeDisabled();

    // A label alone is not enough — the department is what makes it routable.
    fireEvent.change(screen.getByTestId("new-stakeholder-label"), {
      target: { value: "Tech" },
    });
    // The slug follows the label so the admin is not asked to invent one...
    expect(screen.getByTestId("new-stakeholder-slug")).toHaveValue("tech");
    // ...but the bucket still cannot be saved without an owner.
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Owned by"), {
      target: { value: "engineering" },
    });
    expect(add).toBeEnabled();
  });

  it("shows the slug alongside the label, because the slug is what history stores", () => {
    stakeholders = [bucket({ slug: "kam", label: "KAM" })];
    departments = [{ id: "d1", name: "Operations", function_key: "operations" }];
    renderSection();

    const row = screen.getByTestId("stakeholder-row-kam");
    expect(within(row).getByText("kam")).toBeInTheDocument();
    expect(within(row).getByLabelText("Label")).toHaveValue("KAM");
  });

  it("refuses to offer deletion of the terminal bucket", () => {
    // Deleting it would leave no bucket a ticket could ever be closed into. The
    // server refuses too; disabling the control means the admin is not invited
    // to try.
    stakeholders = [bucket({ slug: "closed", label: "Closed", semantics: "closed", function_key: null })];
    departments = [];
    renderSection();

    const row = screen.getByTestId("stakeholder-row-closed");
    expect(within(row).getByLabelText("Delete bucket")).toBeDisabled();
  });

  it("renumbers the whole list when a bucket moves, rather than swapping two", () => {
    // Seeded rows can all carry position 0, and swapping two equal numbers
    // changes nothing on screen — which reads as a dead button.
    updateStakeholder.mutate.mockClear();
    stakeholders = [
      bucket({ slug: "kam", position: 0 }),
      bucket({ slug: "sales", position: 0 }),
      bucket({ slug: "finance", position: 0 }),
    ];
    departments = [{ id: "d1", name: "Operations", function_key: "operations" }];
    renderSection();

    const row = screen.getByTestId("stakeholder-row-finance");
    within(row).getByLabelText("Move up").click();

    // finance moves to index 1 and sales to index 2; kam is already at 0 and is
    // left alone rather than being written back unchanged.
    const calls = updateStakeholder.mutate.mock.calls.map(([arg]) => arg);
    expect(calls).toEqual([
      { id: "id-finance", data: { position: 1 } },
      { id: "id-sales", data: { position: 2 } },
    ]);
  });
});
