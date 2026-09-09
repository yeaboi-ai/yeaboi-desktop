'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import {
  ArrowLeft,
  Check,
  Copy,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ThemeEditor } from '@/components/settings/themes/theme-editor';
import type { ThemeEditorState } from '@/components/settings/themes/theme-editor';
import { BUILTIN_PRESETS } from '@/lib/theme/presets';
import { useTheme } from '@/components/providers/theme-provider';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';
import type { BuiltInPresetId, ColorScheme, ThemeId, TokenMap } from '@/lib/theme/types';

interface BrandResponse {
  id: string | null;
  org_id: string;
  name: string | null;
  is_active: boolean;
  app_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  source_url: string | null;
  theme_id: string | null;
}

interface ThemePresetResponse {
  id: string;
  name: string;
  scope: 'user' | 'org';
  color_scheme: ColorScheme;
  base_preset: string | null;
  tokens: TokenMap;
}

interface BrandSuggestionPayload {
  app_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  source_url: string | null;
  reasoning: string | null;
  theme: {
    name: string;
    color_scheme: ColorScheme;
    base_preset: string | null;
    tokens: TokenMap;
  };
}

type Mode = { kind: 'list' } | { kind: 'analyze' } | { kind: 'edit'; brandId: string };

export default function OrgBrandPage() {
  const { authFetch, ready } = useAuthFetch();
  const { setExplicit } = useTheme();
  const currentOrgId = useMemo(() => (typeof window === 'undefined' ? null : getStoredOrgId()), []);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [brands, setBrands] = useState<BrandResponse[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  // analyze-mode state
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('dark');
  const [colorHint, setColorHint] = useState('');
  const [description, setDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<BrandSuggestionPayload | null>(null);

  // editor state (shared by analyze + edit modes)
  const [draft, setDraft] = useState<ThemeEditorState | null>(null);
  const [draftBrandName, setDraftBrandName] = useState('');
  const [draftAppName, setDraftAppName] = useState('');
  const [draftTagline, setDraftTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState<{
    name: string;
    color_scheme: ColorScheme;
    tokens: TokenMap;
    base: BuiltInPresetId;
  } | null>(null);
  const [editorKey, setEditorKey] = useState(0); // forces remount when switching brand

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBrands = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brands`);
      if (r.ok) setBrands(((await r.json()) as BrandResponse[]) ?? []);
    } catch (err) {
      logger.warn('brand: list load failed', err);
    }
  }, [authFetch, currentOrgId]);

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
          setIsAdmin(my?.role === 'admin');
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      }
      await loadBrands();
    })();
  }, [authFetch, ready, currentOrgId, loadBrands]);

  // ── Mode transitions ──────────────────────────────────────────────
  const enterAnalyze = () => {
    setSuggestion(null);
    setEditorInitial(null);
    setDraftBrandName('');
    setDraftAppName('');
    setDraftTagline('');
    setLogoUrl(null);
    setFaviconUrl(null);
    setWebsiteUrl('');
    setColorHint('');
    setDescription('');
    setAnalyzeError(null);
    setError(null);
    setFlash(null);
    setMode({ kind: 'analyze' });
    setEditorKey((k) => k + 1);
  };

  const enterEdit = async (brand: BrandResponse) => {
    if (!brand.id || !currentOrgId) return;
    setError(null);
    setFlash(null);
    setSuggestion(null);
    setDraftBrandName(brand.name ?? '');
    setDraftAppName(brand.app_name ?? '');
    setDraftTagline(brand.tagline ?? '');
    setLogoUrl(brand.logo_url);
    setFaviconUrl(brand.favicon_url);
    setWebsiteUrl(brand.source_url ?? '');

    // Load underlying theme preset to populate the editor.
    if (brand.theme_id?.startsWith('custom:')) {
      const presetId = brand.theme_id.slice('custom:'.length);
      try {
        const r = await authFetch(`/api/themes/presets/${presetId}`);
        if (r.ok) {
          const preset = (await r.json()) as ThemePresetResponse;
          setEditorInitial({
            name: preset.name,
            color_scheme: preset.color_scheme,
            tokens: preset.tokens,
            base: (preset.base_preset as BuiltInPresetId) ?? 'preset:dark',
          });
        } else {
          // Fallback: default base.
          const base: BuiltInPresetId = 'preset:dark';
          setEditorInitial({
            name: brand.name ?? 'Brand',
            color_scheme: BUILTIN_PRESETS[base].color_scheme,
            tokens: { ...BUILTIN_PRESETS[base].tokens },
            base,
          });
        }
      } catch (err) {
        logger.warn('brand: failed to load theme preset', err);
      }
    } else {
      const base: BuiltInPresetId = 'preset:dark';
      setEditorInitial({
        name: brand.name ?? 'Brand',
        color_scheme: BUILTIN_PRESETS[base].color_scheme,
        tokens: { ...BUILTIN_PRESETS[base].tokens },
        base,
      });
    }
    setMode({ kind: 'edit', brandId: brand.id });
    setEditorKey((k) => k + 1);
  };

  const exitToList = async () => {
    setMode({ kind: 'list' });
    await loadBrands();
  };

  // ── Analyze (AI) ─────────────────────────────────────────────────
  const onAnalyze = async () => {
    if (!currentOrgId) return;
    if (!websiteUrl && !colorHint && !description) {
      setAnalyzeError('Provide at least a website URL, color hint, or description.');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/generate`, {
        method: 'POST',
        body: JSON.stringify({
          url: websiteUrl || null,
          color_hint: colorHint || null,
          brand_description: description || null,
          color_scheme: colorScheme,
        }),
      });
      if (!r.ok) {
        setAnalyzeError(`Analyze failed (${r.status})`);
        return;
      }
      const s = (await r.json()) as BrandSuggestionPayload;
      setSuggestion(s);
      if (s.app_name) {
        setDraftAppName(s.app_name);
        setDraftBrandName(`${s.app_name} brand`);
      }
      if (s.tagline) setDraftTagline(s.tagline);
      if (s.logo_url) setLogoUrl(s.logo_url);
      if (s.favicon_url) setFaviconUrl(s.favicon_url);
      setEditorInitial({
        name: s.app_name ?? 'Brand',
        color_scheme: s.theme.color_scheme,
        tokens: s.theme.tokens,
        base: (s.theme.base_preset as BuiltInPresetId) ?? 'preset:dark',
      });
      setEditorKey((k) => k + 1);
    } catch (err) {
      logger.warn('brand: analyze error', err);
      setAnalyzeError('Network error');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Apply (analyze mode → POST /apply) ──────────────────────────
  const onApply = async () => {
    if (!currentOrgId || !draft) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const body = {
        name: draftBrandName || `${draftAppName || 'Brand'} brand`,
        app_name: draftAppName || null,
        tagline: draftTagline || null,
        logo_url: logoUrl,
        favicon_url: faviconUrl,
        source_url: websiteUrl || null,
        theme_name: draftBrandName || `${draftAppName || 'Brand'} theme`,
        theme: {
          version: 1,
          name: draftAppName || 'Brand',
          base_preset: draft.base,
          color_scheme: draft.color_scheme,
          tokens: draft.tokens,
        },
      };
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/apply`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setError(`Apply failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { theme_id: string };
      setExplicit(data.theme_id as ThemeId);
      window.dispatchEvent(new Event('brand-updated'));
      setFlash('Saved and applied. Members on the org default see this now.');
      await exitToList();
    } catch (err) {
      logger.warn('brand: apply error', err);
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  // ── Save (edit mode → PUT /brands/{id} + PUT theme preset) ─────
  const onSaveEdit = async () => {
    if (mode.kind !== 'edit' || !currentOrgId || !draft) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    const targetBrand = brands.find((b) => b.id === mode.brandId);
    try {
      // Save theme preset tokens if it points at a custom preset.
      if (targetBrand?.theme_id?.startsWith('custom:')) {
        const presetId = targetBrand.theme_id.slice('custom:'.length);
        const themeResp = await authFetch(`/api/themes/presets/${presetId}`, {
          method: 'PUT',
          body: JSON.stringify({
            color_scheme: draft.color_scheme,
            base_preset: draft.base,
            tokens: draft.tokens,
          }),
        });
        if (!themeResp.ok) {
          setError(`Theme save failed (${themeResp.status})`);
          return;
        }
      }
      const brandResp = await authFetch(`/api/orgs/${currentOrgId}/brands/${mode.brandId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draftBrandName || null,
          app_name: draftAppName || null,
          tagline: draftTagline || null,
          logo_url: logoUrl,
          favicon_url: faviconUrl,
          source_url: websiteUrl || null,
        }),
      });
      if (!brandResp.ok) {
        setError(`Brand save failed (${brandResp.status})`);
        return;
      }
      window.dispatchEvent(new Event('brand-updated'));
      setFlash('Saved.');
      await exitToList();
    } catch (err) {
      logger.warn('brand: save edit error', err);
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  // ── Brand-list actions ──────────────────────────────────────────
  const onActivate = async (brand: BrandResponse) => {
    if (!currentOrgId || !brand.id) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brands/${brand.id}/activate`, {
        method: 'POST',
      });
      if (!r.ok) {
        setError(`Activate failed (${r.status})`);
        return;
      }
      if (brand.theme_id) setExplicit(brand.theme_id as ThemeId);
      window.dispatchEvent(new Event('brand-updated'));
      setFlash(`${brand.name ?? 'Brand'} is now active.`);
      await loadBrands();
    } finally {
      setBusy(false);
    }
  };

  const onDuplicate = async (brand: BrandResponse) => {
    if (!currentOrgId || !brand.id) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brands/${brand.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        setError(`Duplicate failed (${r.status})`);
        return;
      }
      setFlash(`Duplicated ${brand.name ?? 'brand'}.`);
      await loadBrands();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (brand: BrandResponse) => {
    if (!currentOrgId || !brand.id) return;
    if (!confirm(`Delete "${brand.name ?? 'this brand'}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brands/${brand.id}`, {
        method: 'DELETE',
      });
      if (r.status === 409) {
        setError("Can't delete the active brand. Activate another brand first, then try again.");
        return;
      }
      if (!r.ok) {
        setError(`Delete failed (${r.status})`);
        return;
      }
      setFlash('Deleted.');
      await loadBrands();
    } finally {
      setBusy(false);
    }
  };

  // ── Logo upload ─────────────────────────────────────────────────
  const onLogoSelected = async (file: File) => {
    if (!currentOrgId) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/logo`, {
        method: 'POST',
        body: fd,
      });
      if (!r.ok) {
        setError(`Logo upload failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { url: string };
      setLogoUrl(data.url);
    } catch (err) {
      logger.warn('brand: logo upload failed', err);
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  if (isAdmin === false) {
    return (
      <SettingsPageShell active="/settings/brand">
        <p className="font-body text-[13px] text-muted-foreground">
          Only an organization admin can change the brand.{' '}
          <Link to="/settings/themes" className="text-primary hover:underline">
            Themes
          </Link>{' '}
          are yours alone and need no permission.
        </p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell active="/settings/brand">
      <div>
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-body text-[13px] text-muted-foreground">
              Save more than one brand, switch between them, duplicate one to make a variant.
            </p>
          </div>
          {mode.kind === 'list' && (
            <button
              type="button"
              onClick={enterAnalyze}
              className="px-3 py-1.5 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3" />
              New brand
            </button>
          )}
          {mode.kind !== 'list' && (
            <button
              type="button"
              onClick={() => void exitToList()}
              className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to brand list
            </button>
          )}
        </header>

        {flash && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-success/15 border border-success/40 text-[11px] font-body text-success">
            {flash}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/15 border border-destructive/40 text-[11px] font-body text-destructive">
            {error}
          </div>
        )}

        {/* Brand list */}
        {mode.kind === 'list' && (
          <BrandList
            brands={brands}
            busy={busy}
            onActivate={onActivate}
            onEdit={enterEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onCreate={enterAnalyze}
          />
        )}

        {/* Analyze + Editor */}
        {mode.kind === 'analyze' && (
          <AnalyzeSection
            websiteUrl={websiteUrl}
            setWebsiteUrl={setWebsiteUrl}
            colorScheme={colorScheme}
            setColorScheme={setColorScheme}
            colorHint={colorHint}
            setColorHint={setColorHint}
            description={description}
            setDescription={setDescription}
            analyzing={analyzing}
            error={analyzeError}
            suggestion={suggestion}
            onAnalyze={onAnalyze}
          />
        )}

        {(mode.kind === 'edit' || (mode.kind === 'analyze' && editorInitial)) && (
          <>
            <BrandDetailsCard
              brandName={draftBrandName}
              setBrandName={setDraftBrandName}
              appName={draftAppName}
              setAppName={setDraftAppName}
              tagline={draftTagline}
              setTagline={setDraftTagline}
              logoUrl={logoUrl}
              setLogoUrl={setLogoUrl}
              fileInputRef={fileInputRef}
              onLogoSelected={onLogoSelected}
            />

            {editorInitial ? (
              <ThemeEditor
                key={editorKey}
                initialName={editorInitial.name}
                initialColorScheme={editorInitial.color_scheme}
                initialTokens={editorInitial.tokens}
                initialBase={editorInitial.base}
                onChange={setDraft}
              />
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {mode.kind === 'edit' ? (
                <button
                  type="button"
                  onClick={onSaveEdit}
                  disabled={busy}
                  className="px-4 py-2 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      Save changes
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onApply}
                  disabled={busy || !editorInitial}
                  className="px-4 py-2 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Save & activate
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </SettingsPageShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────

function BrandList({
  brands,
  busy,
  onActivate,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
}: {
  brands: BrandResponse[];
  busy: boolean;
  onActivate: (b: BrandResponse) => void;
  onEdit: (b: BrandResponse) => void;
  onDuplicate: (b: BrandResponse) => void;
  onDelete: (b: BrandResponse) => void;
  onCreate: () => void;
}) {
  if (brands.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg p-10 text-center bg-card/40">
        <Wand2 className="h-6 w-6 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-sm font-body font-medium text-foreground mb-1">No saved brands yet</h3>
        <p className="text-[11px] font-body text-muted-foreground/80 mb-4 max-w-md mx-auto">
          Paste a company website and the AI will extract colors, logo, and a name. You can save as
          many brands as you like and switch between them.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="px-3 py-1.5 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
        >
          <Plus className="h-3 w-3" />
          Create your first brand
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {brands.map((brand) => (
        <div
          key={brand.id}
          className={`rounded-lg border bg-card p-4 flex items-center gap-4 ${
            brand.is_active ? 'border-primary/50 ring-1 ring-primary/40' : 'border-border'
          }`}
        >
          <div className="w-12 h-12 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-body font-medium text-foreground truncate">
                {brand.name ?? 'Unnamed brand'}
              </h3>
              {brand.is_active && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-body uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] font-body text-muted-foreground/80 truncate">
              {brand.app_name ? <span className="text-foreground">{brand.app_name}</span> : '—'}
              {brand.source_url && (
                <>
                  {' · '}
                  <span className="font-mono">{brand.source_url}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!brand.is_active && (
              <button
                type="button"
                onClick={() => onActivate(brand)}
                disabled={busy}
                className="px-2.5 py-1 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                title="Activate this brand for the org"
              >
                <Check className="h-3 w-3" />
                Activate
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(brand)}
              disabled={busy}
              className="px-2.5 py-1 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(brand)}
              disabled={busy}
              className="px-2.5 py-1 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Duplicate as a new variant"
            >
              <Copy className="h-3 w-3" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => onDelete(brand)}
              disabled={busy || brand.is_active}
              className="px-2.5 py-1 rounded text-[11px] font-body border border-border hover:border-destructive/50 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              title={brand.is_active ? 'Activate another brand first' : 'Delete'}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyzeSection({
  websiteUrl,
  setWebsiteUrl,
  colorScheme,
  setColorScheme,
  colorHint,
  setColorHint,
  description,
  setDescription,
  analyzing,
  error,
  suggestion,
  onAnalyze,
}: {
  websiteUrl: string;
  setWebsiteUrl: (v: string) => void;
  colorScheme: ColorScheme;
  setColorScheme: (s: ColorScheme) => void;
  colorHint: string;
  setColorHint: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  analyzing: boolean;
  error: string | null;
  suggestion: BrandSuggestionPayload | null;
  onAnalyze: () => void;
}) {
  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-body font-semibold text-foreground tracking-wide">
          AI brand generator
        </h2>
      </div>
      <div className="px-5 py-5 space-y-4">
        <div>
          <label className="block text-[11px] font-body text-muted-foreground mb-1">
            Company website
          </label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
          />
          <p className="text-[10px] font-body text-muted-foreground/70 mt-1">
            We'll pull dominant colors, the favicon, and the company description.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-body text-muted-foreground mb-1">
              Color scheme
            </label>
            <div className="flex border border-border rounded overflow-hidden">
              {(['light', 'dark'] as ColorScheme[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setColorScheme(s)}
                  className={`flex-1 px-3 py-2 text-[11px] font-body capitalize transition-colors ${
                    colorScheme === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-body text-muted-foreground mb-1">
              Color hint (optional)
            </label>
            <input
              type="text"
              value={colorHint}
              onChange={(e) => setColorHint(e.target.value)}
              placeholder="#0070f3 or 'pink'"
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-body text-muted-foreground mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fintech for SMBs"
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="px-4 py-2 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Analyze brand
              </>
            )}
          </button>
          {suggestion?.reasoning && (
            <p className="text-[11px] font-body text-muted-foreground italic">
              "{suggestion.reasoning}"
            </p>
          )}
        </div>
        {error && (
          <div className="px-3 py-2 rounded bg-destructive/15 border border-destructive/40 text-[11px] font-body text-destructive">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

function BrandDetailsCard({
  brandName,
  setBrandName,
  appName,
  setAppName,
  tagline,
  setTagline,
  logoUrl,
  setLogoUrl,
  fileInputRef,
  onLogoSelected,
}: {
  brandName: string;
  setBrandName: (v: string) => void;
  appName: string;
  setAppName: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;
  logoUrl: string | null;
  setLogoUrl: (v: string | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onLogoSelected: (file: File) => void;
}) {
  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-xs font-body font-semibold text-foreground tracking-wide">
          Brand details
        </h2>
      </div>
      <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-body text-muted-foreground mb-1">
            Brand name (admin label)
          </label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Acme default, Holiday rebrand"
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
            maxLength={100}
          />
          <p className="text-[10px] font-body text-muted-foreground/60 mt-1">
            Only visible to admins in the brand list.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-body text-muted-foreground mb-1">
            App name (shown to members)
          </label>
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="App name"
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
            maxLength={100}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] font-body text-muted-foreground mb-1">
            Tagline (optional)
          </label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="One short line"
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
            maxLength={200}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] font-body text-muted-foreground mb-1">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="brand logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors"
              >
                Upload logo
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-destructive/50 text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1.5"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onLogoSelected(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
