import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver — needed by cmdk (CommandPalette)
// and by index.tsx's grid (measures container width for column count).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollIntoView either — cmdk calls it to keep the
// selected item visible.
Element.prototype.scrollIntoView ??= () => {};
