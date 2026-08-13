import "@testing-library/jest-dom";

// jsdom implements MutationObserver but not ResizeObserver, so any component that
// re-measures on resize throws on mount. Stubbed here rather than per-test because
// it is a gap in the environment, not behaviour worth asserting: a test that cares
// about re-measuring drives it by calling the callback itself.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as typeof globalThis & { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}
