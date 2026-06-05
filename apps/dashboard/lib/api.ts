"use client";

import { getToken, clearToken } from "./auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(errBody || `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// Auth
export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json() as Promise<{ access_token: string }>;
}

export async function getMe() {
  return apiFetch<{ userId: string; username: string }>("/auth/me");
}

// Devices
export interface DeviceSimInfo {
  slot: number;
  carrier: string;
  phoneNumber?: string | null;
}

export interface Device {
  id: string;
  name: string;
  online: boolean;
  battery: number | null;
  simCarrier: string | null;
  phoneNumber: string | null;
  signalStrength: number | null;
  androidVersion: string | null;
  appVersion: string | null;
  networkType: string | null;
  messageQueueCount: number;
  lastSeen: string | null;
  registrationToken: string;
  rateLimitMax: number | null;
  rateLimitUnit: string | null;
  simSlot: number | null;
  sims: DeviceSimInfo[] | null;
  createdAt: string;
}

export async function getDevices(): Promise<Device[]> {
  return apiFetch<Device[]>("/devices");
}

export async function getDevice(id: string): Promise<Device> {
  return apiFetch<Device>(`/devices/${id}`);
}

export async function registerDevice(name: string): Promise<Device> {
  return apiFetch<Device>("/devices", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteDevice(id: string): Promise<void> {
  await apiFetch(`/devices/${id}`, { method: "DELETE" });
}

// SMS
export interface Message {
  id: string;
  deviceId: string;
  recipient: string;
  body: string;
  status: "PENDING" | "QUEUED" | "SENT_TO_DEVICE" | "DELIVERED" | "FAILED";
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  device?: { id: string; name: string };
}

export async function sendSms(data: {
  recipient: string;
  body: string;
}): Promise<Message> {
  return apiFetch<Message>("/sms/send", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMessages(limit = 20): Promise<Message[]> {
  return apiFetch<Message[]>(`/sms/messages?limit=${limit}`);
}

// Templates
export interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export async function getTemplates(
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Template>> {
  return apiFetch<PaginatedResponse<Template>>(
    `/templates?page=${page}&limit=${limit}`
  );
}

/** Fetch all templates (no pagination) for dropdowns/selectors */
export async function getAllTemplates(): Promise<Template[]> {
  const res = await apiFetch<PaginatedResponse<Template>>(
    "/templates?limit=1000"
  );
  return res.data;
}

export async function getTemplate(id: string): Promise<Template> {
  return apiFetch<Template>(`/templates/${id}`);
}

export async function createTemplate(data: {
  name: string;
  body: string;
}): Promise<Template> {
  return apiFetch<Template>("/templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTemplate(
  id: string,
  data: { name?: string; body?: string }
): Promise<Template> {
  return apiFetch<Template>(`/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/templates/${id}`, { method: "DELETE" });
}

// Campaigns
export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "ABORTED";

export interface CampaignRecipient {
  id: string;
  phoneNumber: string;
  variables: Record<string, string>;
  messageId: string | null;
  message: Message | null;
}

export interface Campaign {
  id: string;
  name: string;
  templateId: string;
  template: Template;
  deviceId: string;
  device?: { id: string; name: string; online: boolean };
  status: CampaignStatus;
  scheduledAt: string | null;
  timezone: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  recipients: CampaignRecipient[];
  _count?: { recipients: number };
}

export interface CampaignProgress {
  campaignId: string;
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

export async function getCampaigns(): Promise<Campaign[]> {
  return apiFetch<Campaign[]>("/campaigns");
}

export async function getCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(`/campaigns/${id}`);
}

export async function createCampaign(data: {
  name: string;
  templateId: string;
  recipients?: { phoneNumber: string; variables: Record<string, string> }[];
  recipientListId?: string;
  variableMapping?: Record<string, string>;
  scheduledAt?: string;
  timezone?: string;
}): Promise<Campaign> {
  return apiFetch<Campaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCampaign(
  id: string,
  data: Partial<{
    name: string;
    templateId: string;
    recipients: { phoneNumber: string; variables: Record<string, string> }[];
    scheduledAt: string;
    timezone: string;
  }>
): Promise<Campaign> {
  return apiFetch<Campaign>(`/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
}

export async function cloneCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(`/campaigns/${id}/clone`, { method: "POST" });
}

export async function sendCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}/send`, { method: "POST" });
}

export async function scheduleCampaign(
  id: string,
  data: { scheduledAt: string; timezone: string }
): Promise<void> {
  await apiFetch(`/campaigns/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function pauseCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}/pause`, { method: "POST" });
}

export async function resumeCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}/resume`, { method: "POST" });
}

export async function abortCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}/abort`, { method: "POST" });
}

export async function retryCampaign(id: string): Promise<void> {
  await apiFetch(`/campaigns/${id}/retry`, { method: "POST" });
}

export async function getCampaignProgress(
  id: string
): Promise<CampaignProgress> {
  return apiFetch<CampaignProgress>(`/campaigns/${id}/progress`);
}

export async function testSendCampaign(data: {
  recipient: string;
  templateBody: string;
  variables: Record<string, string>;
}): Promise<Message> {
  return apiFetch<Message>("/campaigns/test-send", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// API Keys
export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
  lastUsed: string | null;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return apiFetch<ApiKey[]>("/auth/api-keys");
}

export async function createApiKey(
  name: string
): Promise<{ id: string; name: string; keyPrefix: string; rawKey: string }> {
  return apiFetch("/auth/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteApiKey(id: string): Promise<void> {
  await apiFetch(`/auth/api-keys/${id}`, { method: "DELETE" });
}

// Device rate limit and SIM slot
export async function updateDeviceRateLimit(
  deviceId: string,
  max: number | null,
  unit: "per_minute" | "per_hour" | null
): Promise<{ success: boolean; rateLimitMax: number | null; rateLimitUnit: string | null }> {
  return apiFetch(`/devices/${deviceId}/rate-limit`, {
    method: "PATCH",
    body: JSON.stringify({ max, unit }),
  });
}

export async function updateDeviceSimSlot(
  deviceId: string,
  simSlot: number | null
): Promise<{ success: boolean; simSlot: number | null }> {
  return apiFetch(`/devices/${deviceId}/sim-slot`, {
    method: "PATCH",
    body: JSON.stringify({ simSlot }),
  });
}

export interface QueueStats {
  waiting: number;
  active: number;
  etaSeconds: number | null;
  rateLimit: { max: number; duration: number } | null;
}

export async function getCampaignQueueStats(campaignId: string): Promise<QueueStats> {
  return apiFetch<QueueStats>(`/campaigns/${campaignId}/queue-stats`);
}

// Observability / Reporting

export interface MessageLog {
  id: string;
  deviceId: string;
  recipient: string;
  body: string;
  status: "PENDING" | "QUEUED" | "SENT_TO_DEVICE" | "DELIVERED" | "FAILED";
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  queuedAt: string | null;
  createdAt: string;
  device: { id: string; name: string } | null;
  campaign: {
    id: string;
    name: string;
    template: { name: string };
  } | null;
  campaignRecipient: { variables: Record<string, unknown> } | null;
}

export interface MessageLogsResponse {
  messages: MessageLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MessageLogFilter {
  campaignId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  phone?: string;
  page?: number;
  limit?: number;
}

export async function getMessageLogs(params: MessageLogFilter): Promise<MessageLogsResponse> {
  const sp = new URLSearchParams();
  if (params.campaignId) sp.set("campaignId", params.campaignId);
  if (params.status) sp.set("status", params.status);
  if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params.dateTo) sp.set("dateTo", params.dateTo);
  if (params.phone) sp.set("phone", params.phone);
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return apiFetch<MessageLogsResponse>(`/sms/logs${qs ? `?${qs}` : ""}`);
}

export async function downloadMessageExport(params: MessageLogFilter): Promise<void> {
  const sp = new URLSearchParams();
  if (params.campaignId) sp.set("campaignId", params.campaignId);
  if (params.status) sp.set("status", params.status);
  if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params.dateTo) sp.set("dateTo", params.dateTo);
  if (params.phone) sp.set("phone", params.phone);
  const qs = sp.toString();

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/sms/export${qs ? `?${qs}` : ""}`, { headers });
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "messages.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface DashboardStats {
  sentToday: number;
  deliveredToday: number;
  deliveryRate: number;
  devices: Array<{ id: string; name: string; online: boolean }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/sms/stats");
}

export interface DailySendCount {
  date: string;
  count: number;
}

export async function getDailySendCounts(days: 7 | 30): Promise<DailySendCount[]> {
  return apiFetch<DailySendCount[]>(`/sms/stats/daily?days=${days}`);
}

export interface CampaignHistoryEntry {
  id: string;
  name: string;
  status: CampaignStatus;
  template: { id: string; name: string };
  device: { id: string; name: string };
  recipientCount: number;
  sent: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
  createdAt: string;
  completedAt: string | null;
}

export async function getCampaignHistory(limit = 5): Promise<CampaignHistoryEntry[]> {
  return apiFetch<CampaignHistoryEntry[]>(`/campaigns/history?limit=${limit}`);
}

// ─── Recipient Lists ─────────────────────────────────────────────────────────

export interface RecipientList {
  id: string;
  name: string;
  source: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { entries: number };
}

export interface RecipientListEntry {
  id: string;
  listId: string;
  phoneNumber: string;
  variables: Record<string, string>;
  createdAt: string;
}

export interface RecipientListEntriesResponse {
  entries: RecipientListEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getRecipientLists(
  page = 1,
  limit = 20
): Promise<PaginatedResponse<RecipientList>> {
  return apiFetch<PaginatedResponse<RecipientList>>(
    `/recipient-lists?page=${page}&limit=${limit}`
  );
}

/** Fetch all recipient lists (no pagination) for dropdowns/selectors */
export async function getAllRecipientLists(): Promise<RecipientList[]> {
  const res = await apiFetch<PaginatedResponse<RecipientList>>(
    "/recipient-lists?limit=1000"
  );
  return res.data;
}

export async function getRecipientListEntries(
  id: string,
  page = 1,
  limit = 5
): Promise<RecipientListEntriesResponse> {
  return apiFetch<RecipientListEntriesResponse>(
    `/recipient-lists/${id}/entries?page=${page}&limit=${limit}`
  );
}
