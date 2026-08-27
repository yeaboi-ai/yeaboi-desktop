'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Sparkles, Trash2, Users } from 'lucide-react';
import { ThemeEditor } from '@/components/settings/themes/theme-editor';
import type { ThemeEditorState } from '@/components/settings/themes/theme-editor';
import { useTheme } from '@/components/providers/theme-provider';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';
import { BUILTIN_PRESETS } from '@/lib/theme/presets';
import type { BuiltInPresetId, ColorScheme, TokenMap } from '@/lib/theme/types';

interface ThemePresetResponse {
  id: string;
  name: string;
  scope: 'user' | 'org';
  color_scheme: ColorScheme;
  base_preset: string | null;
  owner_user_id: string | null;
  org_id: string | null;
  tokens: TokenMap;
}

export default function ThemeEditorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { authFetch, ready } = useAuthFetch();
  const { setExplicit } = useTheme();

  const editId = params?.get('id') ?? null;
  const cloneFrom = (params?.get('from') as BuiltInPresetId | null) ?? null;
  const isNew = !editId;

  const [loading, setLoading] = useState<boolean>(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThemeEditorState | null>(null);
  const [existing, setExisting] = useState<ThemePresetResponse | null>(null);
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const currentOrgId = useMemo(() => (typeof window === 'undefined' ? null : getStoredOrgId()), []);

  useEffect(() => {
    if (!ready || !currentOrgId) return;
    void (async () => {
      try {
        const [memResp, meResp] = await Promise.all([
          authFetch(`/api/orgs/${currentOrgId}/members`),
          authFetch('/api/me'),
        ]);
        if (memResp.ok && meResp.ok) {
          const members = (await memResp.json()) as { user_id: string; role: string }[];
          const me = (await meResp.json()) as { id?: string; user_id?: string };
          const myId = me.id ?? me.user_id;
          const my = members.find((m) => m.user_id === myId);
          setIsOrgAdmin(my?.role === 'admin');
        }
      } catch {
        /* ignore */
      }
    })();
  }, [authFetch, ready, currentOrgId]);

  useEffect(() => {
    if (!ready || isNew) return;
    void (async () => {
      try {
        const r = await authFetch(`/api/themes/presets/${editId}`);
        if (!r.ok) {
          setError(r.status === 404 ? 'Theme not found' : 'Failed to load');
          return;
        }
        const data = (await r.json()) as ThemePresetResponse;
        setExisting(data);
        setShareWithOrg(data.scope === 'org');
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch, ready, isNew, editId]);

  // Build initial editor state once data is ready.
  const initial = useMemo<ThemeEditorState | null>(() => {
    if (existing) {
      return {
        name: existing.name,
        color_scheme: existing.color_scheme,
        tokens: existing.tokens,
        base: (existing.base_preset as BuiltInPresetId) ?? 'preset:dark',
      };
    }
    if (isNew) {
      const baseId: BuiltInPresetId =
        cloneFrom && cloneFrom in BUILTIN_PRESETS ? cloneFrom : 'preset:dark';
      const baseDoc = BUILTIN_PRESETS[baseId];
      return {
        name: cloneFrom ? `${baseDoc.name} (copy)` : 'My theme',
        color_scheme: baseDoc.color_scheme,
        tokens: { ...baseDoc.tokens },
        base: baseId,
      };
    }
    return null;
  }, [existing, isNew, cloneFrom]);

  const onSave = async (apply = false) => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        color_scheme: draft.color_scheme,
        base_preset: draft.base,
        tokens: draft.tokens,
      };
      let resp: Response;
      let savedId: string | null = null;
      if (isNew) {
        body.scope = shareWithOrg && isOrgAdmin && currentOrgId ? 'org' : 'user';
        if (body.scope === 'org') body.org_id = currentOrgId;
        resp = await authFetch('/api/themes/presets', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          const created = (await resp.json()) as ThemePresetResponse;
          savedId = created.id;
        }
      } else {
        resp = await authFetch(`/api/themes/presets/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        if (resp.ok) savedId = editId;
      }
      if (!resp.ok) {
        const txt = await resp.text();
        setError(txt || 'Save failed');
        return;
      }
      setSavedFlash(savedId);
      if (apply && savedId) {
        setExplicit(`custom:${savedId}` as `custom:${string}`);
      }
      setTimeout(() => router.push('/settings/themes'), 600);
    } catch (err) {
      logger.warn('theme-editor save', err);
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editId) return;
    if (!confirm('Delete this theme? This cannot be undone.')) return;
    setSaving(true);
    try {
      const r = await authFetch(`/api/themes/presets/${editId}`, { method: 'DELETE' });
      if (!r.ok) {
        if (r.status === 409) {
          setError(
            'This theme is currently the organization default. Pick a different org default first.',
          );
        } else {
          setError('Delete failed');
        }
        return;
      }
      router.push('/settings/themes');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !initial) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-xs font-body text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link
          href="/settings/themes"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Themes
        </Link>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display italic text-4xl text-foreground leading-none mb-2">
              {isNew ? 'New custom theme' : 'Edit theme'}
            </h1>
            <p className="text-sm font-body text-muted-foreground">
              Pick colors group by group. The preview on the right updates as you go.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="px-3 py-1.5 rounded text-[11px] font-body border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => onSave(false)}
              disabled={saving}
              className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Save className="h-3 w-3" />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => onSave(true)}
              disabled={saving}
              className="px-3 py-1.5 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-3 w-3" />
              Save & apply
            </button>
          </div>
        </header>

        {savedFlash && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-success/15 border border-success/40 text-[11px] font-body text-success">
            Saved.
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/15 border border-destructive/40 text-[11px] font-body text-destructive">
            {error}
          </div>
        )}

        {isNew && isOrgAdmin && currentOrgId && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-[11px] font-body text-foreground">Share with organization</p>
                <p className="text-[10px] font-body text-muted-foreground/70">
                  Org admins can see and apply this theme. Required to set it as the org default.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shareWithOrg}
              onChange={(e) => setShareWithOrg(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
          </div>
        )}

        <ThemeEditor
          initialName={initial.name}
          initialColorScheme={initial.color_scheme}
          initialTokens={initial.tokens}
          initialBase={initial.base}
          onChange={setDraft}
        />
      </div>
    </div>
  );
}
