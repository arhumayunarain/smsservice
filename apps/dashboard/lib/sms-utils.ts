import { SegmentedMessage } from "sms-segments-calculator";

export function analyzeSms(body: string) {
  if (!body) {
    return {
      charCount: 0,
      segmentCount: 0,
      encoding: "GSM-7" as const,
      nonGsmChars: [] as string[],
    };
  }
  const msg = new SegmentedMessage(body);
  return {
    charCount: body.length,
    segmentCount: msg.segmentsCount,
    encoding: msg.encodingName as "GSM-7" | "UCS-2",
    nonGsmChars: msg.getNonGsmCharacters(),
  };
}

export function extractVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
}

export function renderTemplate(
  body: string,
  variables: Record<string, string>
): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}
