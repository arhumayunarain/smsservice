"use client";

import { useState } from "react";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Users,
} from "lucide-react";

interface Recipient {
  phoneNumber: string;
  variables: Record<string, string>;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface Duplicate {
  phoneNumber: string;
  rows: number[];
}

interface ImportPreviewProps {
  recipients: Recipient[];
  errors: ValidationError[];
  duplicates: Duplicate[];
  templateBody: string;
  templateVariables: string[];
  importedFileName: string;
  onConfirm: (duplicateResolution?: "keep_first" | "keep_last") => void;
  onBack: () => void;
  confirming?: boolean;
  /** When false, validation errors are shown as warnings but do not block confirmation. Default: true */
  strict?: boolean;
}

function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}

export function ImportPreview({
  recipients,
  errors,
  duplicates,
  templateBody,
  templateVariables,
  importedFileName,
  onConfirm,
  onBack,
  confirming = false,
  strict = true,
}: ImportPreviewProps) {
  const [duplicateResolution, setDuplicateResolution] = useState<
    "keep_first" | "keep_last" | null
  >(null);

  const hasErrors = errors.length > 0;
  const hasDuplicates = duplicates.length > 0;
  // In relaxed mode (strict=false), errors are warnings — don't block confirmation
  const canConfirm = strict
    ? !hasErrors && (!hasDuplicates || duplicateResolution !== null)
    : !hasDuplicates || duplicateResolution !== null;

  const previewRecipients = recipients.slice(0, 10);
  const messagePreviewRecipients = recipients.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Validation errors (strict = blocking, relaxed = warning only) */}
      {hasErrors && (
        <div className={`rounded-lg border overflow-hidden ${strict ? "border-destructive/30 bg-destructive/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
          <div className={`flex items-center gap-2 px-4 py-3 ${strict ? "bg-destructive/20" : "bg-yellow-500/20"}`}>
            <AlertCircle className={`h-4 w-4 shrink-0 ${strict ? "text-destructive" : "text-yellow-400"}`} />
            <span className={`text-sm font-medium ${strict ? "text-destructive" : "text-yellow-400"}`}>
              {errors.length} row{errors.length !== 1 ? "s" : ""} have errors
              {strict ? " — fix your file and re-upload" : " — these rows will be skipped (warnings only)"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-destructive/20">
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium w-16">
                    Row
                  </th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    Field
                  </th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-destructive/10">
                {errors.slice(0, 20).map((err, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {err.row}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-foreground">
                      {err.field}
                    </td>
                    <td className="px-4 py-2 text-xs text-destructive">
                      {err.message}
                    </td>
                  </tr>
                ))}
                {errors.length > 20 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-xs text-muted-foreground text-center">
                      ...and {errors.length - 20} more errors
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Duplicate warning */}
      {!hasErrors && hasDuplicates && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
            <span className="text-sm font-medium text-yellow-400">
              {duplicates.length} duplicate phone number
              {duplicates.length !== 1 ? "s" : ""} found — choose how to resolve
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="overflow-x-auto rounded border border-yellow-500/20">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-yellow-500/20">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                      Phone Number
                    </th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                      Appears in Rows
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-500/10">
                  {duplicates.slice(0, 10).map((dup) => (
                    <tr key={dup.phoneNumber}>
                      <td className="px-3 py-2 font-mono text-foreground">
                        {dup.phoneNumber}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {dup.rows.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="dup-resolution"
                  value="keep_first"
                  checked={duplicateResolution === "keep_first"}
                  onChange={() => setDuplicateResolution("keep_first")}
                  className="text-primary"
                />
                <span className="text-sm text-foreground">
                  Keep first occurrence
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="dup-resolution"
                  value="keep_last"
                  checked={duplicateResolution === "keep_last"}
                  onChange={() => setDuplicateResolution("keep_last")}
                  className="text-primary"
                />
                <span className="text-sm text-foreground">
                  Keep last occurrence (overwrite with latest data)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Valid data preview */}
      {!hasErrors && recipients.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-foreground">
              {recipients.length} valid recipient
              {recipients.length !== 1 ? "s" : ""} from{" "}
              <span className="font-mono text-xs">{importedFileName}</span>
            </span>
          </div>

          {/* Data table */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              Recipient Preview
              {recipients.length > 10 && (
                <span className="text-xs text-muted-foreground font-normal">
                  (showing first 10 of {recipients.length})
                </span>
              )}
            </h4>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                      Phone Number
                    </th>
                    {templateVariables.map((v) => (
                      <th
                        key={v}
                        className="text-left px-3 py-2 text-muted-foreground font-medium"
                      >
                        <span className="font-mono">{`{${v}}`}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewRecipients.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        {r.phoneNumber}
                      </td>
                      {templateVariables.map((v) => (
                        <td
                          key={v}
                          className="px-3 py-2 text-xs text-foreground"
                        >
                          {r.variables[v] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rendered message preview */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">
              Message Preview (first {Math.min(3, recipients.length)})
            </h4>
            <div className="space-y-2">
              {messagePreviewRecipients.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-3 bg-muted/10"
                >
                  <p className="text-xs font-mono text-muted-foreground mb-1">
                    To: {r.phoneNumber}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {renderTemplate(templateBody, r.variables)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Mapping
        </button>

        <button
          type="button"
          onClick={() => canConfirm && onConfirm(duplicateResolution ?? undefined)}
          disabled={!canConfirm || confirming}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirming ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Add Recipients
            </>
          )}
        </button>
      </div>
    </div>
  );
}
