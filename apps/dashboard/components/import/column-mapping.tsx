"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Wand2, AlertCircle } from "lucide-react";

export interface MappingResult {
  phoneColumn: string;
  variableMapping: Record<string, string>;
}

interface MapPreviewResult {
  valid: boolean;
  recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>;
  errors: Array<{ row: number; field: string; message: string }>;
  duplicates: Array<{ phoneNumber: string; rows: number[] }>;
  autoMapping?: {
    phoneColumn: string | null;
    variableMapping: Record<string, string | null>;
  };
}

interface ColumnMappingProps {
  headers: string[];
  templateVariables: string[];
  importJobId: string;
  templateId?: string;
  onConfirm: (mapping: MappingResult, previewResult: MapPreviewResult) => void;
  apiBaseUrl?: string;
  /** When false, validation errors become warnings (non-blocking). Default: true */
  strict?: boolean;
  /** Override the map API endpoint path. Default: '/import/map' */
  mapEndpoint?: string;
}

// Auto-detect phone columns locally (mirrors backend logic)
const PHONE_HEADERS = [
  "phone",
  "phone_number",
  "mobile",
  "contact",
  "number",
  "tel",
  "cell",
  "phonenumber",
  "mobile_number",
  "msisdn",
];

function autoDetectPhone(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const ph of PHONE_HEADERS) {
    const idx = lower.indexOf(ph);
    if (idx !== -1) return headers[idx];
  }
  const idx = lower.findIndex((h) => PHONE_HEADERS.some((ph) => h.includes(ph)));
  return idx !== -1 ? headers[idx] : null;
}

function autoDetectVariable(
  variable: string,
  headers: string[]
): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  const lowerVar = variable.toLowerCase();
  const exact = lower.indexOf(lowerVar);
  if (exact !== -1) return headers[exact];
  const partial = lower.findIndex(
    (h) => h.includes(lowerVar) || lowerVar.includes(h)
  );
  return partial !== -1 ? headers[partial] : null;
}

export function ColumnMapping({
  headers,
  templateVariables,
  importJobId,
  templateId,
  onConfirm,
  apiBaseUrl,
  strict = true,
  mapEndpoint,
}: ColumnMappingProps) {
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  const [variableMapping, setVariableMapping] = useState<
    Record<string, string>
  >({});
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getApiUrl = useCallback(() => {
    if (apiBaseUrl) return apiBaseUrl;
    if (typeof window !== "undefined") return `${window.location.origin}/api`;
    return "/api";
  }, [apiBaseUrl]);

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sms_admin_token");
      if (stored) return { Authorization: `Bearer ${stored}` };
    }
    return {};
  }, []);

  const runAutoDetect = useCallback(() => {
    const detectedPhone = autoDetectPhone(headers);
    setPhoneColumn(detectedPhone ?? "");

    const detected: Record<string, string> = {};
    for (const v of templateVariables) {
      const col = autoDetectVariable(v, headers);
      detected[v] = col ?? "";
    }
    setVariableMapping(detected);
  }, [headers, templateVariables]);

  // Auto-detect on mount
  useEffect(() => {
    runAutoDetect();
  }, [runAutoDetect]);

  const canPreview = phoneColumn !== "";

  async function handlePreview() {
    if (!canPreview) return;
    setPreviewing(true);
    setError(null);

    try {
      const endpoint = mapEndpoint || '/import/map';
      const res = await fetch(`${getApiUrl()}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          importJobId,
          phoneColumn,
          variableMapping,
          ...(templateId ? { templateId } : {}),
          strict,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: HTTP ${res.status}`);
      }

      const result: MapPreviewResult = await res.json();
      onConfirm({ phoneColumn, variableMapping }, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate mapping");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">Map Columns</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Match your file columns to the template fields
          </p>
        </div>
        <button
          type="button"
          onClick={runAutoDetect}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Auto-detect
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-1/2">
                Template Field
              </th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-1/2">
                File Column
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Phone number row */}
            <tr className="bg-primary/5">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Phone Number</span>
                  <span className="text-xs text-destructive font-medium">Required</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recipient phone number
                </p>
              </td>
              <td className="px-4 py-3">
                <div className="relative">
                  <select
                    value={phoneColumn}
                    onChange={(e) => setPhoneColumn(e.target.value)}
                    className="w-full appearance-none px-3 py-2 pr-8 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select column...</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </td>
            </tr>

            {/* Variable rows */}
            {templateVariables.map((variable) => (
              <tr key={variable}>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-primary">{`{${variable}}`}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="relative">
                    <select
                      value={variableMapping[variable] ?? ""}
                      onChange={(e) =>
                        setVariableMapping((prev) => ({
                          ...prev,
                          [variable]: e.target.value,
                        }))
                      }
                      className="w-full appearance-none px-3 py-2 pr-8 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select column...</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                          {variableMapping[variable] === h ? " " : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </td>
              </tr>
            ))}

            {templateVariables.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-sm text-muted-foreground">
                  This template has no variables — only phone numbers needed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!canPreview && (
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-400">
            Select a phone number column to proceed.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {previewing ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Validating...
            </>
          ) : (
            "Preview"
          )}
        </button>
      </div>
    </div>
  );
}
