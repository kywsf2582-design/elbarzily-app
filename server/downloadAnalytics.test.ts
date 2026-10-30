import { describe, expect, it } from "vitest";
import { cairoIsoDate, classifyDownloadAgent, shiftIsoDate } from "./downloadAnalytics";

describe("download analytics classification", () => {
  it("classifies Android WebView requests without retaining the raw agent", () => {
    expect(classifyDownloadAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 wv)"))
      .toEqual({ deviceType: "mobile", osName: "Android", browserName: "Android WebView" });
  });

  it("classifies Windows Edge desktop requests", () => {
    expect(classifyDownloadAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"))
      .toEqual({ deviceType: "desktop", osName: "Windows", browserName: "Edge" });
  });

  it("identifies iPad Safari as a tablet and handles an empty agent safely", () => {
    expect(classifyDownloadAgent("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"))
      .toEqual({ deviceType: "tablet", osName: "iOS", browserName: "Safari" });
    expect(classifyDownloadAgent(undefined)).toEqual({ deviceType: "other", osName: "Other", browserName: "Other" });
  });
});

describe("Cairo analytics date helpers", () => {
  it("formats the selected instant in Cairo time and shifts ISO calendar days", () => {
    expect(cairoIsoDate(new Date("2026-10-26T22:30:00.000Z"))).toBe("2026-10-27");
    expect(shiftIsoDate("2026-10-27", -6)).toBe("2026-10-21");
  });
});
