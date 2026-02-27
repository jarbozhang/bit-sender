import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
