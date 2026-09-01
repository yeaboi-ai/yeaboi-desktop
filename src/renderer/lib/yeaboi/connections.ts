// Wire types + calls for the integrations catalog (contracts/v1/app_http.md):
// GET /api/connections and the custom-connection + webhook-receiver routes.
// Never a credential on a read — a field reports `is_set` and nothing more.

import { apiGet, apiPost } from './api';

export interface ConnectionAuthMethod {
  key: string;
  label: string;
  summary: string;
  recommended: boolean;
  warning: string;
  setup_url: string;
  envs: string[];
}

export interface ConnectionField {
  env: string;
  label: string;
  secret: boolean;
  required: boolean;
  is_set: boolean;
  choices: string[];
  default: string;
  placeholder: string;
  hint: string;
  help_url: string;
  help_scope: string;
  auth_method: string;
}

export interface ConnectionRow {
  key: string;
  label: string;
  summary: string;
  detail: string;
  family: string;
  family_label: string;
  section: string;
  connected: boolean;
  read_only: boolean;
  /** Where configuring happens: "connections" rows carry their own connect
   *  form; "credentials" rows deep-link to Settings > Credentials. */
  managed_by: 'connections' | 'credentials';
  /** A custom connection's kind (api/webhook/mcp); "" on built-in and legacy
   *  rows. What lets a surface shape the form without sniffing env names. */
  kind: '' | 'api' | 'webhook' | 'mcp';
  docs_url: string;
  glyph: string;
  accent: string;
  verify_kind: string;
  auth_env: string;
  auth_methods: ConnectionAuthMethod[];
  fields: ConnectionField[];
  /** Returned once, on the row a webhook-kind create answers with. */
  webhook_secret?: string;
}

export interface ConnectionsPayload {
  connectors: ConnectionRow[];
  families: { key: string; label: string }[];
  connected: string[];
}

export interface CustomEventsMapping {
  path?: string;
  items_key?: string;
  kind: string;
  title_path: string;
  ref_path?: string;
  severity_path?: string;
  status_path?: string;
  url_path?: string;
  started_at_path?: string;
  service_path?: string;
}

export interface CustomConnectionSpec {
  key: string;
  label: string;
  family: string;
  summary: string;
  detail?: string;
  docs_url?: string;
  glyph: string;
  accent: string;
  kind: 'api' | 'webhook' | 'mcp';
  auth_scheme?: 'bearer' | 'basic' | 'header';
  header_name?: string;
  probe_path?: string;
  probe_ok_status?: number;
  webhook_verify?: 'token' | 'hmac';
  events?: CustomEventsMapping | null;
}

export interface CustomDraft {
  ok: boolean;
  draft: Partial<CustomConnectionSpec>;
  problems: string[];
}

export interface WebhookConnectionStatus {
  key: string;
  label: string;
  last_received_at: string;
}

export interface WebhooksStatus {
  running: boolean;
  port: number;
  started_at: string;
  tunnel_url: string;
  connections: WebhookConnectionStatus[];
}

export interface WebhookUrlInfo {
  key: string;
  url: string;
  tunnel_url: string;
  verify: 'token' | 'hmac';
  header: string;
  secret: string;
  running: boolean;
  last_received_at: string;
}

/** The catalog. `all` is the browse view: every connector that could be added,
 *  plus the built-in integrations as managed_by:"credentials" rows. */
export const loadConnections = (all = false) =>
  apiGet<ConnectionsPayload>(`/api/connections${all ? '?all=1' : ''}`);

export const createCustomConnection = (spec: CustomConnectionSpec) =>
  apiPost<ConnectionRow>('/api/connections/custom', spec);

export const draftCustomConnection = (description: string) =>
  apiPost<CustomDraft>('/api/connections/custom/draft', { description });

export const deleteCustomConnection = (key: string) =>
  apiPost<{ deleted: string }>(`/api/connections/custom/${encodeURIComponent(key)}/delete`);

export const webhooksStatus = () => apiGet<WebhooksStatus>('/api/webhooks/status');
export const webhooksStart = () => apiPost<WebhooksStatus>('/api/webhooks/start');
export const webhooksStop = () => apiPost<WebhooksStatus>('/api/webhooks/stop');
export const webhooksShare = () => apiPost<WebhooksStatus>('/api/webhooks/share');
export const webhookUrl = (key: string) =>
  apiGet<WebhookUrlInfo>(`/api/webhooks/${encodeURIComponent(key)}/url`);

/** Live-check one row after its fields are saved. Empty body: the probe reads
 *  the just-saved values on the backend, so no secret is echoed back here. */
export const verifyConnectionKind = (kind: string) =>
  apiPost<{ ok: boolean; message: string }>('/api/settings/connection/verify', { kind });
