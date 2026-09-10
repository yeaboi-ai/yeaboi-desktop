// Wire types + calls for the /api/settings surface (contracts/v1/app_http.md).
// Secrets are write-only over this wire: a secret field's `value` is a masked
// preview, and writes send the raw value through the main-process proxy.

import { apiGet, apiGetOptional, apiPost } from './api';
import type { ConnectionStatus } from './connection-status';

export type { ConnectionStatus };

export interface SettingField {
  env: string;
  label: string;
  section: string;
  secret: boolean;
  value: string;
  is_set: boolean;
  choices: string[];
  choice_labels: Record<string, string>;
  active_choice: string;
  default: string;
  action: string;
  help_url: string;
  help_scope: string;
  /** 'text' or 'list'. Absent on a sidecar that predates list settings. */
  kind?: string;
  /** What one entry of a list is: 'email', 'path', or ''. */
  item_kind?: string;
  /** A list field's parsed entries. */
  items?: string[];
}

export interface VoiceDevice {
  index: number;
  name: string;
  channels?: number;
  samplerate?: number;
  is_default: boolean;
}

export interface SettingsSnapshot {
  fields: SettingField[];
  sections: string[];
  config_path: string;
  voice: { state: string; detail: string; devices: VoiceDevice[] };
  /** What the last live probe of each connection found. Absent on an older sidecar. */
  connections?: Record<string, ConnectionStatus>;
}

export interface ProviderCard {
  name: string;
  full_name: string;
  env_var: string;
  provider_val: string;
  prefix: string;
  tagline: string;
  instructions: string;
  is_region_input?: boolean;
  is_base_url_input?: boolean;
  default_input?: string;
  models: { default: string; presets: string[] };
  model_hints?: Record<string, string>;
}

export interface ProviderCatalog {
  providers: ProviderCard[];
  anthropic_auth_modes: string[];
  token_help: Record<string, { url: string; scope: string }>;
}

export interface WriteResult {
  ok: boolean;
  key: string;
  message: string;
  restart_required: boolean;
}

export interface SignInStatus {
  active: boolean;
  url?: string;
  awaiting_code?: boolean;
  done?: boolean;
  ok?: boolean;
  saved?: boolean;
  message?: string;
}

export const loadSettings = () => apiGet<SettingsSnapshot>('/api/settings');
export const loadProviders = () => apiGet<ProviderCatalog>('/api/settings/providers');
export const saveSetting = (key: string, value: string) =>
  apiPost<WriteResult>('/api/settings/set', { key, value });
export const saveAllowedPaths = (paths: string[]) =>
  apiPost<WriteResult>('/api/settings/allowed-paths', { paths });
/** Replace a list setting's entries. Falls back to the joined write on a
 *  sidecar that has no /api/settings/list, so this ships before the backend. */
export const saveList = (field: SettingField, items: string[]) =>
  field.kind === 'list'
    ? apiPost<WriteResult>('/api/settings/list', { key: field.env, items })
    : saveSetting(field.env, items.join(','));

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

/** The workspace's channels, or null on a sidecar that cannot list them. */
export const loadSlackChannels = () =>
  apiGetOptional<{ channels: SlackChannel[]; reason: string }>('/api/settings/slack/channels');

export const saveDataDir = (value: string, move: boolean) =>
  apiPost<WriteResult>('/api/settings/data-dir', { value, move });
export const verifyProvider = (provider: string, credential: string, model = '') =>
  apiPost<{ ok: boolean; message: string }>('/api/settings/provider/verify', {
    provider,
    credential,
    model,
  });
export const discoverModels = (provider: string, credential: string) =>
  apiPost<{ models: string[]; default: string; hints: Record<string, string> }>(
    '/api/settings/provider/models',
    {
      provider,
      credential,
    },
  );
/** Live-check one optional integration. Flat body per the wire contract;
 *  omitted fields fall back to values already saved on the backend. */
export const verifyConnection = (
  kind: 'github' | 'jira' | 'confluence' | 'notion' | 'elevenlabs' | 'tavus',
  fields: { token?: string; base_url?: string; email?: string; space_key?: string } = {},
) =>
  apiPost<{ ok: boolean; message: string }>('/api/settings/connection/verify', {
    kind,
    ...fields,
  });
export const signInStart = () =>
  apiPost<{ started: boolean; message: string }>('/api/settings/signin/start');
export const signInStatus = () => apiGet<SignInStatus>('/api/settings/signin');
export const signInCode = (code: string) =>
  apiPost<{ ok: boolean }>('/api/settings/signin/code', { code });
export const signInCancel = () => apiPost<{ ok: boolean }>('/api/settings/signin/cancel');

/** The Cloudflare Access doctor: what is set up and what is not.
 *  Offline and cheap — it never resolves the cloudflared binary. */
export interface AccessState {
  logged_in: boolean;
  cert_path: string;
  jwt_installed: boolean;
  missing_keys: string[];
}

export const loadAccessState = () => apiGet<AccessState>('/api/settings/access/state');
/** The same preflight a board runs before publishing. Fetches JWKS; a few seconds. */
export const verifyAccess = () =>
  apiPost<{ ok: boolean; message: string }>('/api/settings/access/verify');
