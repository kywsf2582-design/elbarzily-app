import { describe, expect, it } from "vitest";
import { microphoneErrorMessage } from "./mediaPermissions";

describe("microphone permission errors", () => {
  it("guides the user to enable a denied permission", () => {
    expect(microphoneErrorMessage("NotAllowedError")).toContain("صلاحية الميكروفون غير مفعّلة");
    expect(microphoneErrorMessage("SecurityError")).toContain("إعدادات الهاتف/المتصفح");
  });

  it("distinguishes missing and busy microphones", () => {
    expect(microphoneErrorMessage("NotFoundError")).toContain("لم نعثر على ميكروفون");
    expect(microphoneErrorMessage("NotReadableError")).toContain("مستخدم من تطبيق آخر");
  });

  it("does not leak raw browser exception strings", () => {
    expect(microphoneErrorMessage("UnexpectedError: private detail")).toBe("ماقدرناش نبدأ التسجيل. اتأكد من إذن الميكروفون واتصال التطبيق وجرّب تاني.");
  });
});
