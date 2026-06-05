"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Send,
  Clock,
  Save,
  FlaskConical,
  Check,
  AlertTriangle,
  PenLine,
  CheckCircle2,
  Search,
  List,
} from "lucide-react";
import {
  getAllTemplates,
  createCampaign,
  sendCampaign,
  scheduleCampaign,
  testSendCampaign,
  getAllRecipientLists,
  getRecipientListEntries,
  Template,
  RecipientList,
  RecipientListEntry,
} from "@/lib/api";
import { renderTemplate, analyzeSms } from "@/lib/sms-utils";

// ---- Timezone data ----
const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "(GMT-05:00) Eastern Time" },
  { value: "America/Chicago", label: "(GMT-06:00) Central Time" },
  { value: "America/Denver", label: "(GMT-07:00) Mountain Time" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) Pacific Time" },
  { value: "America/Anchorage", label: "(GMT-09:00) Alaska" },
  { value: "Pacific/Honolulu", label: "(GMT-10:00) Hawaii" },
  { value: "UTC", label: "(GMT+00:00) UTC" },
  { value: "Europe/London", label: "(GMT+00:00) London" },
  { value: "Europe/Paris", label: "(GMT+01:00) Paris" },
  { value: "Europe/Berlin", label: "(GMT+01:00) Berlin" },
  { value: "Europe/Istanbul", label: "(GMT+03:00) Istanbul" },
  { value: "Asia/Dubai", label: "(GMT+04:00) Dubai" },
  { value: "Asia/Karachi", label: "(GMT+05:00) Karachi" },
  { value: "Asia/Kolkata", label: "(GMT+05:30) India" },
  { value: "Asia/Dhaka", label: "(GMT+06:00) Dhaka" },
  { value: "Asia/Bangkok", label: "(GMT+07:00) Bangkok" },
  { value: "Asia/Shanghai", label: "(GMT+08:00) Shanghai" },
  { value: "Asia/Tokyo", label: "(GMT+09:00) Tokyo" },
  { value: "Australia/Sydney", label: "(GMT+11:00) Sydney" },
  { value: "Pacific/Auckland", label: "(GMT+12:00) Auckland" },
];

// ---- Zod Schemas ----
const recipientSchema = z.object({
  phoneNumber: z
    .string()
    .min(7, "Phone number is too short")
    .regex(/^[\+\d][\d\s\-()]*$/, "Invalid phone number format"),
  variables: z.record(z.string(), z.string()),
});

const formSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  templateId: z.string().min(1, "Select a template"),
  recipients: z.array(recipientSchema).optional(),
  recipientMode: z.enum(["list", "manual"]),
});

type FormValues = z.infer<typeof formSchema>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case "FILE":
      return "bg-blue-500/15 text-blue-400";
    case "SHEETS":
      return "bg-green-500/15 text-green-400";
    case "POSTEX":
      return "bg-orange-500/15 text-orange-400";
    case "LEOPARDS":
      return "bg-yellow-500/15 text-yellow-400";
    case "MANUAL":
      return "bg-purple-500/15 text-purple-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialogs
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleTimezone, setScheduleTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Test send
  const [showTestSend, setShowTestSend] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Recipient list state
  const [recipientLists, setRecipientLists] = useState<RecipientList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [selectedList, setSelectedList] = useState<RecipientList | null>(null);
  const [listPreviewEntries, setListPreviewEntries] = useState<RecipientListEntry[]>([]);
  const [listPreviewLoading, setListPreviewLoading] = useState(false);
  // variableMapping: listColumnName -> templateVariableName
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [mappingAutoDetected, setMappingAutoDetected] = useState(false);

  // Draft autosave
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const draftSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const draftRestored = useRef(false);

  const {
    control,
    register,
    trigger,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      templateId: "",
      recipients: [{ phoneNumber: "", variables: {} }],
      recipientMode: "list",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  });

  const watchedTemplateId = useWatch({ control, name: "templateId" });
  const watchedName = useWatch({ control, name: "name" });
  const watchedRecipients = useWatch({ control, name: "recipients" });
  const watchedMode = useWatch({ control, name: "recipientMode" });

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === watchedTemplateId),
    [templates, watchedTemplateId]
  );
  // Rendered messages for review (manual mode only)
  const renderedMessages = useMemo(() => {
    if (!selectedTemplate || watchedMode !== "manual") return [];
    return (watchedRecipients ?? []).map((r) => {
      const rendered = renderTemplate(
        selectedTemplate.body,
        r.variables ?? {}
      );
      const analysis = analyzeSms(rendered);
      return { phoneNumber: r.phoneNumber, rendered, analysis };
    });
  }, [selectedTemplate, watchedRecipients, watchedMode]);

  const hasUcs2 = renderedMessages.some(
    (m) => m.analysis.encoding === "UCS-2"
  );

  useEffect(() => {
    async function load() {
      try {
        const t = await getAllTemplates();
        setTemplates(t);

        // Restore draft from localStorage after data is loaded
        if (!draftRestored.current) {
          draftRestored.current = true;
          try {
            const raw = localStorage.getItem("campaign_wizard_draft");
            if (raw) {
              const draft = JSON.parse(raw) as {
                step: number;
                formValues: Partial<FormValues>;
                selectedListId?: string;
                timestamp: number;
              };
              // Only restore if draft is less than 24 hours old
              if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
                if (draft.formValues.name) setValue("name", draft.formValues.name);
                if (draft.formValues.templateId) setValue("templateId", draft.formValues.templateId);
                if (draft.formValues.recipientMode) setValue("recipientMode", draft.formValues.recipientMode);
                if (draft.formValues.recipients && draft.formValues.recipients.length > 0) {
                  setValue("recipients", draft.formValues.recipients);
                }
                if (draft.step > 1) setStep(draft.step);

                const ago = Math.round((Date.now() - draft.timestamp) / 60000);
                const agoText = ago < 1 ? "just now" : ago < 60 ? `${ago}min ago` : `${Math.round(ago / 60)}hr ago`;
                setDraftRestoredAt(agoText);
              }
            }
          } catch {
            // Ignore corrupted draft
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave draft to localStorage on form changes
  useEffect(() => {
    if (loading) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const draft = {
          step,
          formValues: {
            name: watchedName,
            templateId: watchedTemplateId,
            recipientMode: watchedMode,
            recipients: watchedRecipients,
          },
          selectedListId: selectedList?.id,
          timestamp: Date.now(),
        };
        localStorage.setItem("campaign_wizard_draft", JSON.stringify(draft));
      } catch {
        // Ignore localStorage errors
      }
    }, 1000);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [step, watchedName, watchedTemplateId, watchedMode, watchedRecipients, selectedList, loading]);

  function clearDraft() {
    localStorage.removeItem("campaign_wizard_draft");
  }

  // Load recipient lists when entering step 2
  useEffect(() => {
    if (step === 2 && recipientLists.length === 0) {
      setListsLoading(true);
      getAllRecipientLists()
        .then(setRecipientLists)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load lists")
        )
        .finally(() => setListsLoading(false));
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // When template changes, update recipient variable keys (manual mode)
  useEffect(() => {
    if (!selectedTemplate) return;
    const vars = selectedTemplate.variables;
    const current = watchedRecipients ?? [];
    current.forEach((r, i) => {
      const updated: Record<string, string> = {};
      vars.forEach((v) => {
        updated[v] = r.variables?.[v] ?? "";
      });
      setValue(`recipients.${i}.variables`, updated);
    });
  }, [watchedTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a list is selected, fetch preview entries and auto-detect mapping
  useEffect(() => {
    if (!selectedList) {
      setListPreviewEntries([]);
      setVariableMapping({});
      setMappingAutoDetected(false);
      return;
    }

    setListPreviewLoading(true);
    getRecipientListEntries(selectedList.id, 1, 5)
      .then((res) => {
        setListPreviewEntries(res.entries);

        // Auto-detect variable mapping
        const templateVars = selectedTemplate?.variables ?? [];
        if (res.entries.length > 0 && templateVars.length > 0) {
          const listColumns = Object.keys(res.entries[0].variables ?? {});
          const mapping: Record<string, string> = {};
          let allMapped = true;

          for (const templateVar of templateVars) {
            const match = listColumns.find(
              (col) => col.toLowerCase() === templateVar.toLowerCase()
            );
            if (match) {
              mapping[match] = templateVar;
            } else {
              allMapped = false;
            }
          }

          setVariableMapping(mapping);
          setMappingAutoDetected(allMapped && templateVars.length > 0);
        } else {
          setVariableMapping({});
          setMappingAutoDetected(true); // no template vars = nothing to map
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load preview")
      )
      .finally(() => setListPreviewLoading(false));
  }, [selectedList, selectedTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  const addRecipientRow = useCallback(() => {
    const vars: Record<string, string> = {};
    (selectedTemplate?.variables ?? []).forEach((v) => {
      vars[v] = "";
    });
    append({ phoneNumber: "", variables: vars });
  }, [append, selectedTemplate]);

  // Filtered lists
  const filteredLists = useMemo(() => {
    if (!listSearch.trim()) return recipientLists;
    const q = listSearch.toLowerCase();
    return recipientLists.filter((l) => l.name.toLowerCase().includes(q));
  }, [recipientLists, listSearch]);

  // Whether Step 2 is complete and user can proceed
  const canProceedStep2 = useMemo(() => {
    if (watchedMode === "list") {
      return selectedList !== null;
    }
    // manual: need at least one non-empty phone number
    return (watchedRecipients ?? []).some((r) => r.phoneNumber.trim().length >= 7);
  }, [watchedMode, selectedList, watchedRecipients]);

  // Recipient count for display
  const recipientCount = useMemo(() => {
    if (watchedMode === "list") {
      return selectedList?._count?.entries ?? 0;
    }
    return (watchedRecipients ?? []).filter((r) => r.phoneNumber.trim()).length;
  }, [watchedMode, selectedList, watchedRecipients]);

  async function goNext() {
    if (step === 1) {
      const valid = await trigger(["templateId"]);
      if (valid) setStep(2);
    } else if (step === 2) {
      const nameValid = await trigger(["name"]);
      if (!nameValid) return;

      if (watchedMode === "list" && !selectedList) {
        setError("Select a recipient list to continue");
        return;
      }
      if (watchedMode === "manual") {
        const valid = await trigger(["recipients"]);
        if (!valid) return;
      }
      setError(null);
      setStep(3);
    }
  }

  function buildCampaignPayload() {
    const base = {
      name: watchedName,
      templateId: watchedTemplateId,
    };

    if (watchedMode === "list" && selectedList) {
      return {
        ...base,
        recipientListId: selectedList.id,
        variableMapping: Object.keys(variableMapping).length > 0 ? variableMapping : undefined,
      };
    }

    return {
      ...base,
      recipients: (watchedRecipients ?? []).map((r) => ({
        phoneNumber: r.phoneNumber,
        variables: r.variables ?? {},
      })),
    };
  }

  async function handleSendNow() {
    setShowSendConfirm(false);
    setSubmitting(true);
    setError(null);
    try {
      const campaign = await createCampaign(buildCampaignPayload());
      await sendCampaign(campaign.id);
      clearDraft();
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
      setSubmitting(false);
    }
  }

  async function handleSchedule() {
    if (!scheduleDate || !scheduleTime) {
      setError("Please select both date and time");
      return;
    }
    setShowScheduleDialog(false);
    setSubmitting(true);
    setError(null);
    try {
      const localDateTime = new Date(`${scheduleDate}T${scheduleTime}:00`);
      const utcDate = fromZonedTime(localDateTime, scheduleTimezone);

      const campaign = await createCampaign(buildCampaignPayload());
      await scheduleCampaign(campaign.id, {
        scheduledAt: utcDate.toISOString(),
        timezone: scheduleTimezone,
      });
      clearDraft();
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to schedule campaign"
      );
      setSubmitting(false);
    }
  }

  async function handleSaveDraft() {
    setSubmitting(true);
    setError(null);
    try {
      const campaign = await createCampaign(buildCampaignPayload());
      clearDraft();
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save campaign"
      );
      setSubmitting(false);
    }
  }

  async function handleTestSend() {
    if (!testPhone || !selectedTemplate) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const firstRecipient = watchedRecipients?.[0];
      await testSendCampaign({
        recipient: testPhone,
        templateBody: selectedTemplate.body,
        variables: firstRecipient?.variables ?? {},
      });
      setTestResult("Test message sent successfully!");
    } catch (err) {
      setTestResult(
        err instanceof Error ? err.message : "Failed to send test message"
      );
    } finally {
      setTestSending(false);
    }
  }

  // Extract list column names from preview entries
  const listColumns = useMemo(() => {
    if (listPreviewEntries.length === 0) return [];
    return Object.keys(listPreviewEntries[0].variables ?? {});
  }, [listPreviewEntries]);

  const templateVars = selectedTemplate?.variables ?? [];

  // Whether all template vars are mapped (or there are none)
  const allVarsMapped = useMemo(() => {
    if (templateVars.length === 0) return true;
    return templateVars.every((v) =>
      Object.values(variableMapping).includes(v)
    );
  }, [templateVars, variableMapping]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-muted-foreground text-center py-8">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() =>
            step > 1 ? setStep(step - 1) : router.push("/campaigns")
          }
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {step > 1 ? "Back" : "Campaigns"}
        </button>
        <h1 className="text-2xl font-semibold text-foreground">
          New Campaign
        </h1>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  s < step
                    ? "bg-primary text-primary-foreground"
                    : s === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              <span
                className={`text-sm ${
                  s === step
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {s === 1
                  ? "Template & Device"
                  : s === 2
                  ? `Recipients${step >= 2 && recipientCount > 0 ? ` (${recipientCount})` : ""}`
                  : "Review & Send"}
              </span>
              {s < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {draftRestoredAt && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md text-sm text-blue-400 flex items-center justify-between">
          <span>Draft restored from {draftRestoredAt}</span>
          <button
            onClick={() => {
              clearDraft();
              setDraftRestoredAt(null);
            }}
            className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Select Template & Device */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-foreground mb-3">
              Select Template
            </h2>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No templates available. Create one first.
              </p>
            ) : (
              <div className="grid gap-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setValue("templateId", t.id)}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      watchedTemplateId === t.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="font-medium text-foreground">{t.name}</div>
                    <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {t.body}
                    </div>
                    {t.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.variables.map((v) => (
                          <span
                            key={v}
                            className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-mono"
                          >
                            {`{${v}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {errors.templateId && (
              <p className="text-sm text-destructive mt-2">
                {errors.templateId.message}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Recipients */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Campaign Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Campaign Name
            </label>
            <input
              {...register("name")}
              placeholder="e.g. Spring Sale 2026"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.name && (
              <p className="text-sm text-destructive mt-1">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Mode selector */}
          <div>
            <h2 className="text-lg font-medium text-foreground mb-3">
              Recipients
            </h2>
            <div className="flex rounded-lg border border-border overflow-hidden w-fit mb-5">
              <button
                type="button"
                onClick={() => {
                  setValue("recipientMode", "list");
                  setError(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  watchedMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <List className="h-4 w-4" />
                Select from saved list
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue("recipientMode", "manual");
                  setError(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-l border-border transition-colors ${
                  watchedMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <PenLine className="h-4 w-4" />
                Manual entry
              </button>
            </div>

            {/* List picker */}
            {watchedMode === "list" && (
              <div className="space-y-4">
                {listsLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Loading lists...
                  </p>
                ) : recipientLists.length === 0 ? (
                  <div className="text-center py-8 rounded-lg border border-dashed border-border">
                    <List className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      No saved lists yet.
                    </p>
                    <a
                      href="/recipients"
                      className="text-sm text-primary hover:underline"
                    >
                      Create one in the Recipients tab
                    </a>
                  </div>
                ) : (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                        placeholder="Search lists..."
                        className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {/* List table */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border">
                            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                              Name
                            </th>
                            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                              Source
                            </th>
                            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">
                              Recipients
                            </th>
                            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">
                              Created
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLists.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="text-center text-muted-foreground py-6"
                              >
                                No lists match your search.
                              </td>
                            </tr>
                          ) : (
                            filteredLists.map((list) => (
                              <tr
                                key={list.id}
                                onClick={() => {
                                  setSelectedList(
                                    selectedList?.id === list.id ? null : list
                                  );
                                  setError(null);
                                }}
                                className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                                  selectedList?.id === list.id
                                    ? "bg-primary/10 border-l-2 border-l-primary"
                                    : "hover:bg-accent/50"
                                }`}
                              >
                                <td className="px-4 py-3 font-medium text-foreground">
                                  {list.name}
                                  {list.description && (
                                    <p className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">
                                      {list.description}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sourceBadgeClass(list.source)}`}
                                  >
                                    {list.source}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-foreground">
                                  {list._count.entries.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                                  {formatDate(list.createdAt)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Selected list preview + variable mapping */}
                    {selectedList && (
                      <div className="space-y-4">
                        {/* Selection confirmation */}
                        <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {selectedList.name} selected
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              This list has{" "}
                              <strong>{selectedList._count.entries.toLocaleString()}</strong>{" "}
                              recipient{selectedList._count.entries !== 1 ? "s" : ""}.
                            </p>
                          </div>
                        </div>

                        {/* Preview table */}
                        {listPreviewLoading ? (
                          <p className="text-sm text-muted-foreground">
                            Loading preview...
                          </p>
                        ) : listPreviewEntries.length > 0 ? (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">
                              First {listPreviewEntries.length} of{" "}
                              {selectedList._count.entries} recipients:
                            </p>
                            <div className="rounded-lg border border-border overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/30 border-b border-border">
                                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                      Phone
                                    </th>
                                    {listColumns.map((col) => (
                                      <th
                                        key={col}
                                        className="text-left px-3 py-2 text-muted-foreground font-medium"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {listPreviewEntries.map((entry) => (
                                    <tr
                                      key={entry.id}
                                      className="border-b border-border last:border-b-0"
                                    >
                                      <td className="px-3 py-2 font-mono text-foreground">
                                        {entry.phoneNumber}
                                      </td>
                                      {listColumns.map((col) => (
                                        <td
                                          key={col}
                                          className="px-3 py-2 text-muted-foreground"
                                        >
                                          {entry.variables?.[col] ?? ""}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        {/* Variable mapping */}
                        {templateVars.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-foreground mb-2">
                              Column Mapping
                            </h3>
                            {mappingAutoDetected ? (
                              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                                <p className="text-sm text-green-400">
                                  Columns auto-mapped — list columns match template variables.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground mb-3">
                                  Map list columns to template variables:
                                </p>
                                {templateVars.map((templateVar) => {
                                  // Find which listCol maps to this templateVar
                                  const currentListCol =
                                    Object.entries(variableMapping).find(
                                      ([, tv]) => tv === templateVar
                                    )?.[0] ?? "";

                                  return (
                                    <div
                                      key={templateVar}
                                      className="flex items-center gap-3"
                                    >
                                      <span className="text-sm font-mono text-primary w-32 shrink-0">
                                        {`{${templateVar}}`}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        &larr;
                                      </span>
                                      <select
                                        value={currentListCol}
                                        onChange={(e) => {
                                          const newListCol = e.target.value;
                                          setVariableMapping((prev) => {
                                            const next = { ...prev };
                                            // Remove old mapping for this template var
                                            for (const [k, v] of Object.entries(next)) {
                                              if (v === templateVar) delete next[k];
                                            }
                                            if (newListCol) {
                                              next[newListCol] = templateVar;
                                            }
                                            return next;
                                          });
                                        }}
                                        className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                      >
                                        <option value="">
                                          -- select column --
                                        </option>
                                        {listColumns.map((col) => (
                                          <option key={col} value={col}>
                                            {col}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                                {!allVarsMapped && (
                                  <p className="text-xs text-yellow-400 flex items-center gap-1.5 mt-2">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Some template variables are not mapped. They will be sent as empty.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Manual entry */}
            {watchedMode === "manual" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Add recipients manually
                  </span>
                  <button
                    type="button"
                    onClick={addRecipientRow}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-md transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Row
                  </button>
                </div>

                {errors.recipients && !Array.isArray(errors.recipients) && (
                  <p className="text-sm text-destructive">
                    {errors.recipients.message}
                  </p>
                )}

                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[180px]">
                          Phone Number
                        </th>
                        {(selectedTemplate?.variables ?? []).map((v) => (
                          <th
                            key={v}
                            className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[140px]"
                          >
                            <span className="font-mono">{`{${v}}`}</span>
                          </th>
                        ))}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => (
                        <tr
                          key={field.id}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-3 py-2">
                            <input
                              {...register(`recipients.${index}.phoneNumber`)}
                              placeholder="+1234567890"
                              className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {errors.recipients?.[index]?.phoneNumber && (
                              <p className="text-xs text-destructive mt-0.5">
                                {errors.recipients[index].phoneNumber?.message}
                              </p>
                            )}
                          </td>
                          {(selectedTemplate?.variables ?? []).map((v) => (
                            <td key={v} className="px-3 py-2">
                              <input
                                {...register(
                                  `recipients.${index}.variables.${v}`
                                )}
                                placeholder={v}
                                className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            {fields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceedStep2}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canProceedStep2 ? "Select a list or add recipients" : undefined}
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Send */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <h2 className="text-lg font-medium text-foreground mb-3">
              Campaign Summary
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="text-foreground font-medium">
                  {watchedName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Template:</span>{" "}
                <span className="text-foreground font-medium">
                  {selectedTemplate?.name}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Recipients:</span>{" "}
                <span className="text-foreground font-medium">
                  {watchedMode === "list" && selectedList ? (
                    <>
                      {selectedList.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({selectedList._count.entries.toLocaleString()} recipients)
                      </span>
                    </>
                  ) : (
                    <>{recipientCount}</>
                  )}
                </span>
              </div>
            </div>

            {/* Variable mapping summary */}
            {watchedMode === "list" && selectedList && Object.keys(variableMapping).length > 0 && !mappingAutoDetected && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1.5">
                  Variable mapping:
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(variableMapping).map(([listCol, templateVar]) => (
                    <span
                      key={listCol}
                      className="px-2 py-0.5 bg-muted rounded text-xs text-muted-foreground font-mono"
                    >
                      {listCol} &rarr; {`{${templateVar}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {watchedMode === "list" && selectedList && mappingAutoDetected && templateVars.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-green-400">
                  Columns auto-mapped to template variables.
                </p>
              </div>
            )}
          </div>

          {/* UCS-2 Warning (manual mode only) */}
          {hasUcs2 && watchedMode === "manual" && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-400">
                Some messages use UCS-2 encoding (special characters or emoji).
                This reduces the max characters per segment from 160 to 70.
              </div>
            </div>
          )}

          {/* Rendered messages (manual mode only) */}
          {watchedMode === "manual" && renderedMessages.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">
                Message Preview ({renderedMessages.length} messages)
              </h3>
              <div className="rounded-lg border border-border max-h-80 overflow-y-auto divide-y divide-border">
                {renderedMessages.map((m, i) => (
                  <div key={i} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-foreground">
                        {m.phoneNumber || "(no number)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.analysis.charCount} chars / {m.analysis.segmentCount}{" "}
                        segment{m.analysis.segmentCount !== 1 ? "s" : ""}{" "}
                        ({m.analysis.encoding})
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {m.rendered}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Segment count estimates assume the displayed encoding. If
                recipient variables contain emoji or special characters, actual
                segment count may be higher.
              </p>
            </div>
          )}

          {/* List mode — template preview with first entry variables */}
          {watchedMode === "list" && selectedList && selectedTemplate && listPreviewEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">
                Sample Message (first recipient)
              </h3>
              <div className="rounded-lg border border-border p-3">
                {(() => {
                  const firstEntry = listPreviewEntries[0];
                  const rawVars = firstEntry.variables ?? {};
                  const resolvedVars: Record<string, string> = {};
                  if (Object.keys(variableMapping).length > 0) {
                    for (const [listCol, templateVar] of Object.entries(variableMapping)) {
                      if (rawVars[listCol] !== undefined) {
                        resolvedVars[templateVar] = rawVars[listCol];
                      }
                    }
                  } else {
                    Object.assign(resolvedVars, rawVars);
                  }
                  const rendered = renderTemplate(selectedTemplate.body, resolvedVars);
                  const analysis = analyzeSms(rendered);
                  return (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-mono text-foreground">
                          {firstEntry.phoneNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {analysis.charCount} chars / {analysis.segmentCount} segment
                          {analysis.segmentCount !== 1 ? "s" : ""} ({analysis.encoding})
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {rendered}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setShowTestSend(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4" />
              Test Send
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {submitting ? "Saving..." : "Save as Draft"}
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleDialog(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setShowSendConfirm(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Sending..." : "Send Now"}
            </button>
          </div>
        </div>
      )}

      {/* Send Now Confirmation Dialog */}
      {showSendConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Send Campaign Now
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              You are about to send{" "}
              <strong className="text-foreground">
                {recipientCount.toLocaleString()}
              </strong>{" "}
              messages. This cannot be undone. Proceed?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSendConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNow}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Dialog */}
      {showScheduleDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Schedule Campaign
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Timezone
                </label>
                <select
                  value={scheduleTimezone}
                  onChange={(e) => setScheduleTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowScheduleDialog(false)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Send Dialog */}
      {showTestSend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Send Test Message
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Send a test message using the first recipient&apos;s variable
              values.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+1234567890"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {testResult && (
              <p
                className={`text-sm mb-4 ${
                  testResult.includes("success")
                    ? "text-green-400"
                    : "text-destructive"
                }`}
              >
                {testResult}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTestSend(false);
                  setTestResult(null);
                }}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleTestSend}
                disabled={testSending || !testPhone}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {testSending ? "Sending..." : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
