import { invokeLLM, type InvokeParams, type MessageContent } from "./_core/llm";

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(
        part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      )
    )
    .map(part => part.text)
    .join("\n");
}

/** Parse a JSON object returned as plain JSON or inside a ```json fenced block. */
export function extractJsonObject(content: unknown): unknown {
  const text = contentText(content).trim();
  if (!text) return undefined;
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    // Some providers add short prose around the object; isolate the outer object.
  }
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

type JsonInvokeParams = Omit<
  InvokeParams,
  "responseFormat" | "response_format"
> & {
  responseFormat?: never;
  response_format?: never;
};

/**
 * Request JSON with response_format, then retry once without it if the model
 * errors, truncates, returns empty content, malformed JSON, or a caller-invalid shape.
 */
export async function invokeJsonWithFallback(
  params: JsonInvokeParams,
  validate?: (value: unknown) => boolean
): Promise<unknown> {
  let first: Awaited<ReturnType<typeof invokeLLM>> | undefined;
  try {
    first = await invokeLLM({
      ...params,
      responseFormat: { type: "json_object" },
    });
  } catch {
    // The unstructured retry below is the single supported recovery attempt.
  }

  const firstContent = Array.isArray(first?.choices)
    ? first.choices[0]?.message?.content
    : undefined;
  const firstParsed = extractJsonObject(firstContent);
  if (
    firstParsed !== undefined &&
    (!validate || validate(firstParsed))
  ) {
    return firstParsed;
  }

  const fallback = await invokeLLM(params);
  const fallbackContent = Array.isArray(fallback?.choices)
    ? fallback.choices[0]?.message?.content
    : undefined;
  const fallbackParsed = extractJsonObject(fallbackContent);
  if (
    fallbackParsed !== undefined &&
    (!validate || validate(fallbackParsed))
  ) {
    return fallbackParsed;
  }

  throw new Error("تعذر قراءة جدول صالح من رد الذكاء الاصطناعي. راجع الأمر وحاول مرة أخرى.");
}

export type { MessageContent };
