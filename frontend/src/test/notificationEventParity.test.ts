/**
 * Every notification event the backend can emit needs a row you can switch off.
 *
 * The backend declares the events, their categories and their channel defaults;
 * this settings screen holds a hand-written label and description per event.
 * Nothing connected the two and they drifted — `campaign_send_blocked`,
 * `review_cycle_activated` and `review_deadline_reminder` had no entry, so their
 * rows rendered as `eventType.replace(/_/g, " ")`. That degrades to something
 * plausible enough ("campaign send blocked") that nobody files it, which is
 * exactly why it survived.
 *
 * A missing *category* is worse than a missing event label: the master toggle's
 * whole heading disappears, so a category with no entry silently loses the one
 * control that switches all its events at once.
 *
 * The fixture is generated from the backend by
 * `backend/scripts/dump_notification_events.py`; that script's `--check` mode
 * keeps the fixture honest and this test keeps the TypeScript matching it.
 * Adding an event now fails on whichever side was forgotten.
 */

import { describe, expect, it } from "vitest";

import {
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
} from "@/app/(app)/settings/notifications/page";

import fixture from "./fixtures/notification-events.generated.json";

const backendEvents = Object.keys(fixture.events).sort();
const backendCategories = [...fixture.categories].sort();

describe("notification event parity", () => {
  it("labels every backend event", () => {
    const missing = backendEvents.filter((event) => !EVENT_TYPE_LABELS[event]);
    expect(
      missing,
      `These events would render as a raw slug in notification settings. Add them to ` +
        `EVENT_TYPE_LABELS in src/app/(app)/settings/notifications/page.tsx.`
    ).toEqual([]);
  });

  it("has no label for an event the backend cannot emit", () => {
    const known = new Set(backendEvents);
    const orphans = Object.keys(EVENT_TYPE_LABELS)
      .filter((event) => !known.has(event))
      .sort();
    expect(
      orphans,
      `These rows are toggles that control nothing — the backend has no such ` +
        `event. Either wire an emitter or remove the label.`
    ).toEqual([]);
  });

  it("labels every backend category", () => {
    const missing = backendCategories.filter((category) => !CATEGORY_LABELS[category]);
    expect(
      missing,
      `A category with no entry loses its master toggle heading. Add them to ` +
        `CATEGORY_LABELS.`
    ).toEqual([]);
  });

  it("has no category label the backend does not define", () => {
    const known = new Set(backendCategories);
    const orphans = Object.keys(CATEGORY_LABELS)
      .filter((category) => !known.has(category))
      .sort();
    expect(orphans).toEqual([]);
  });

  it("gives every event a category and complete channel defaults", () => {
    // Mirrors backend/tests/unit/test_notification_event_coverage.py, asserted
    // here too so a stale fixture cannot hide a regression from the frontend.
    for (const [event, meta] of Object.entries(fixture.events)) {
      expect(meta.category, `${event} has no category`).toBeTruthy();
      expect(
        Object.keys(meta.defaults).sort(),
        `${event} does not state all four channels`
      ).toEqual(["email", "in_app", "slack", "web_push"]);
    }
  });
});
