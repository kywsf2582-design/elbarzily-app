import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRenderedEmail } from "./service";

const email = {
  subject: "رمز تحقق تجريبي",
  html: "<p>123456</p>",
  text: "123456",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Brevo transactional email transport", () => {
  it("posts the rendered message to Brevo with the API key header", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo-api");
    vi.stubEnv("BREVO_API_KEY", "fake-test-key-not-a-real-credential");
    vi.stubEnv("BREVO_FROM", "verified@example.test");

    const fetchMock = vi.fn().mockResolvedValue(new Response("{\"messageId\":\"test-id\"}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendRenderedEmail("recipient@example.test", email);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("fake-test-key-not-a-real-credential");
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender: { email: "verified@example.test", name: "تطبيق البرازيلي" },
      to: [{ email: "recipient@example.test" }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    });
  });

  it("fails closed when the selected Brevo transport has no API key", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo-api");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_FROM", "verified@example.test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRenderedEmail("recipient@example.test", email)).rejects.toThrow("إعداد مفتاح Brevo API غير مكتمل.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose the provider response body when sending fails", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo-api");
    vi.stubEnv("BREVO_API_KEY", "fake-test-key-not-a-real-credential");
    vi.stubEnv("BREVO_FROM", "verified@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret-shaped-provider-body", { status: 401 })));

    await expect(sendRenderedEmail("recipient@example.test", email)).rejects.toThrow("تعذر إرسال البريد عبر Brevo API.");
  });
});
