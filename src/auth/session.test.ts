import { describe, expect, it } from "vitest";

import { safeReturnTo } from "./session";

describe("safeReturnTo", () => {
  it.each(["/app", "/app/profile", "/app/jobs?status=saved"])(
    "keeps protected local path %s",
    (path) => {
      expect(safeReturnTo(path)).toBe(path);
    },
  );

  it.each([
    "https://evil.example/app",
    "//evil.example/app",
    "/sign-in",
    null,
    { path: "/app" },
  ])("rejects unsafe return target %s", (value) => {
    expect(safeReturnTo(value)).toBe("/app");
  });
});
