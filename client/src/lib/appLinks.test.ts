import { describe, expect, it } from "vitest";
import { getAuthAwareOpenPath, resolveAppOpenTarget } from "./appLinks";

describe("app deep links", () => {
  it("opens the app home", () => {
    expect(resolveAppOpenTarget("/open")).toEqual({ webPath: "/", desktopUri: "elbarzily://app" });
  });

  it("maps a positive numeric booking ID to the real profile route", () => {
    const target = resolveAppOpenTarget("/open/booking/4821");
    expect(target).toEqual({ webPath: "/profile?booking=4821", desktopUri: "elbarzily://booking/4821" });
    expect(getAuthAwareOpenPath(target!, false)).toBe("/login?next=%2Fprofile%3Fbooking%3D4821");
    expect(getAuthAwareOpenPath(target!, true)).toBe("/profile?booking=4821");
  });

  it.each(["/open/booking/0", "/open/booking/-1", "/open/booking/1?next=https://evil.test", "/open/../admin", "https://evil.test/"]) (
    "rejects an unrecognized path: %s",
    pathname => expect(resolveAppOpenTarget(pathname)).toBeNull(),
  );
});
