'use client';

// Which model runs each heavy generation task.
//
// The provider and its key are not here: Credentials owns those for every
// surface, and the planning backend is started with that same environment
// (planningEnv in src/main/planning.ts). This section is only the four
// per-task overrides, which have no other home.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Cpu, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingsInlineError,
} from '@/components/settings/primitives';

// An override may switch provider as well as model: the backend infers the
// provider from the id (claude-→anthropic, gpt-/o…→openai, gemini-→google).
// Mirrors TASK_MODEL_OPTIONS in the planning platform's AI settings.
const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Auto (role default)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast, cheap' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 — highest quality' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

// The heavy tasks that can be retargeted. Mirrors the flow / arch / wireframe /
// wireframe_critic roles in backend/src/app/services/ai_provider.py.
const TASK_MODELS = [
  {
    key: 'flow_model',
    label: 'User-flow diagrams',
    hint: 'Step-by-step product flow generation.',
  },
  {
    key: 'arch_model',
    label: 'Cloud architecture diagrams',
    hint: 'Infrastructure and system diagrams.',
  },
  {
    key: 'wireframe_model',
    label: 'UI mockups (drafter)',
    hint: 'Drafts each hero screen — a cheap model works well here.',
  },
  {
    key: 'wireframe_critic_model',
    label: 'UI critic (refinement)',
    hint: 'Reviews and enriches the hero — a strong model earns its cost here.',
  },
] as const;

type TaskKey = (typeof TASK_MODELS)[number]['key'];
type TaskModels = Record<TaskKey, string>;

const EMPTY: TaskModels = {
  flow_model: '',
  arch_model: '',
  wireframe_model: '',
  wireframe_critic_model: '',
};

export function ModelsTab() {
  const { authFetch, ready } = useAuthFetch();
  const orgId = getStoredOrgId();
  const [models, setModels] = useState<TaskModels>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !orgId) return;
    try {
      const resp = await authFetch(`/api/orgs/${orgId}/ai-config`);
      if (!resp.ok) throw new Error(`ai-config ${resp.status}`);
      const data = (await resp.json()) as Partial<Record<TaskKey, string | null>>;
      setModels({
        flow_model: data.flow_model ?? '',
        arch_model: data.arch_model ?? '',
        wireframe_model: data.wireframe_model ?? '',
        wireframe_critic_model: data.wireframe_critic_model ?? '',
      });
    } catch {
      setError('Could not read the model settings.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, ready, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await authFetch(`/api/orgs/${orgId}/ai-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(models),
      });
      if (!resp.ok) throw new Error(`save ${resp.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save. The change is still on screen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SettingsSectionHeader
          title="Models per task"
          subtitle="Which model runs each heavy generation task. Auto uses the role default."
          icon={<Cpu className="size-4 text-muted-foreground" aria-hidden="true" />}
        />
        <div className="space-y-4 px-4 py-4">
          {TASK_MODELS.map((task) => (
            <div key={task.key} className="space-y-1">
              <Label
                htmlFor={`model-${task.key}`}
                className="text-[10px] font-body font-medium uppercase tracking-[0.1em] text-muted-foreground"
              >
                {task.label}
              </Label>
              <select
                id={`model-${task.key}`}
                value={models[task.key]}
                disabled={loading}
                onChange={(e) => setModels((prev) => ({ ...prev, [task.key]: e.target.value }))}
                className="h-8 w-full rounded-lg border border-input bg-background px-2 font-body text-xs text-foreground disabled:opacity-50"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id || 'auto'} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="font-body text-[10px] text-muted-foreground/60">{task.hint}</p>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => void save()} disabled={saving || loading} size="sm">
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </Button>
          </div>

          {error && <SettingsInlineError message={error} />}
        </div>
      </SettingsCard>

      <SettingsCard variant="subtle">
        <SettingsSectionHeader
          title="The provider and its key"
          subtitle="One credential behind every surface — this window, the terminal and the agents."
          icon={<KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />}
          action={
            <Link
              to="/settings/credentials"
              className="rounded-lg border border-input px-3 py-1.5 font-body text-xs text-foreground transition-colors hover:bg-secondary/50"
            >
              Credentials
            </Link>
          }
        />
      </SettingsCard>
    </div>
  );
}
