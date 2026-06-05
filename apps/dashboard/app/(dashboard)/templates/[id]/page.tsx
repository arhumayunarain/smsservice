"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, AlertTriangle, CheckCircle } from "lucide-react";
import { getTemplate, updateTemplate } from "@/lib/api";
import { analyzeSms, extractVariables, renderTemplate } from "@/lib/sms-utils";

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sampleVars, setSampleVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const template = await getTemplate(id);
        setName(template.name);
        setBody(template.body);
        // Pre-populate sample vars with variable names as placeholders
        const vars = extractVariables(template.body);
        const initial: Record<string, string> = {};
        vars.forEach((v) => {
          initial[v] = v.charAt(0).toUpperCase() + v.slice(1);
        });
        setSampleVars(initial);
      } catch {
        router.push("/templates");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  // Extract variables from body whenever body changes
  const detectedVars = useMemo(() => extractVariables(body), [body]);

  // Keep sampleVars in sync with detected vars (add new, keep existing)
  useEffect(() => {
    setSampleVars((prev) => {
      const updated = { ...prev };
      detectedVars.forEach((v) => {
        if (!(v in updated)) {
          updated[v] = v.charAt(0).toUpperCase() + v.slice(1);
        }
      });
      // Remove vars no longer in body
      Object.keys(updated).forEach((k) => {
        if (!detectedVars.includes(k)) {
          delete updated[k];
        }
      });
      return updated;
    });
  }, [detectedVars]);

  // SMS analysis (memoized)
  const smsStats = useMemo(() => analyzeSms(body), [body]);

  // Rendered preview
  const previewText = useMemo(
    () => renderTemplate(body, sampleVars),
    [body, sampleVars]
  );

  const insertVariable = useCallback((varName: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = body.slice(0, start) + `{${varName}}` + body.slice(end);
    setBody(newBody);
    // Restore cursor after inserted text
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varName.length + 2, start + varName.length + 2);
    }, 0);
  }, [body]);

  async function handleSave() {
    if (!name.trim() || !body.trim()) return;
    try {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      await updateTemplate(id, { name: name.trim(), body: body.trim() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  // Segment limit based on encoding
  const segmentCharLimit = smsStats.encoding === "UCS-2" ? 70 : 160;
  const multiSegmentLimit = smsStats.encoding === "UCS-2" ? 67 : 153;
  const charLimit =
    smsStats.segmentCount > 1
      ? smsStats.segmentCount * multiSegmentLimit
      : segmentCharLimit;

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading template...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/templates"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">
            Edit Template
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle className="h-4 w-4" />
              Saved
            </span>
          )}
          {saveError && (
            <span className="text-sm text-destructive">{saveError}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Name field */}
      <div className="mb-5">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Template Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="w-full max-w-md px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Side-by-side layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Editor panel */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="body"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Message Body
            </label>
            <textarea
              id="body"
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Hi {firstName}, your order {orderId} is ready!"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
            />

            {/* Character / segment count */}
            <div className="flex items-center justify-between mt-1.5">
              <span
                className={`text-xs font-mono ${
                  smsStats.charCount > charLimit
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {smsStats.charCount} / {charLimit} chars &mdash;{" "}
                {smsStats.segmentCount} segment
                {smsStats.segmentCount !== 1 ? "s" : ""} ({smsStats.encoding})
              </span>
            </div>

            {/* GSM-7 warning */}
            {smsStats.nonGsmChars.length > 0 && (
              <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300">
                  <span className="font-medium">Non-GSM-7 characters detected: </span>
                  <span className="font-mono">
                    {smsStats.nonGsmChars.join(" ")}
                  </span>
                  <p className="mt-1 text-amber-300/70">
                    Message will use UCS-2 encoding (70 chars/segment instead
                    of 160).
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Variable picker */}
          {detectedVars.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Insert variable at cursor:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedVars.map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVariable(v)}
                    className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full font-mono hover:bg-primary/20 transition-colors"
                  >
                    {"{"}
                    {v}
                    {"}"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview panel */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">
              Live Preview
            </h2>

            {/* Sample variable inputs */}
            {detectedVars.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Sample values for preview:
                </p>
                {detectedVars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-primary w-28 shrink-0">
                      {"{"}
                      {v}
                      {"}"}
                    </label>
                    <input
                      type="text"
                      value={sampleVars[v] ?? ""}
                      onChange={(e) =>
                        setSampleVars((prev) => ({
                          ...prev,
                          [v]: e.target.value,
                        }))
                      }
                      placeholder={v}
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Phone screen preview */}
            <div className="rounded-3xl border-2 border-border bg-muted/20 p-4 min-h-[200px] max-w-xs mx-auto">
              <div className="bg-muted/40 rounded-2xl p-4 min-h-[120px]">
                {previewText ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {previewText}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/40 italic">
                    Your message preview will appear here...
                  </p>
                )}
              </div>
              {/* SMS stats in preview */}
              <div className="mt-3 text-center">
                <span className="text-xs text-muted-foreground/60">
                  {smsStats.charCount} chars &bull; {smsStats.segmentCount} SMS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
