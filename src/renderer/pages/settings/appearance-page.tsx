'use client';

// The one tab for how the window looks: the themes, and what it shows when you
// have been away. Themes used to be a tab of its own beside an Appearance tab
// that held a light/dark switch — the same choice, asked twice.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  Copy,
  ImageIcon,
  Loader2,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import { SettingsCard } from '@/components/settings/primitives/settings-card';
import { SettingsSectionHeader } from '@/components/settings/primitives/settings-section-header';
import { ScreensaverSection } from '@/components/settings/tabs/general/screensaver-section';
import { BUILTIN_PRESETS } from '@/lib/theme/presets';
import type { BuiltInPresetId, ColorScheme, ThemeId, TokenMap } from '@/lib/theme/types';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const BUILTIN_ORDER: BuiltInPresetId[] = [
  'preset:light',
  'preset:dark',
  'preset:midnight',
  'preset:high-contrast',
  'preset:sepia',
  'preset:ocean',
  'preset:rose',
  'preset:sunshine',
  'preset:forest',
];

interface CustomPresetSummary {
  id: string;
  name: string;
  scope: 'user' | 'org';
  color_scheme: ColorScheme;
  base_preset: string | null;
  org_id: string | null;
}

type SheetId = 'org' | 'new-custom';

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

export default function AppearanceSettingsPage() {
  const router = useRouter();
  const {
    themeId,
    preference,
    colorScheme,
    setExplicit,
    followOrgDefault,
    preview,
    previewTheme,
    previewSystem,
    cancelPreview,
  } = useTheme();
  const { authFetch, ready } = useAuthFetch();
  const [customPresets, setCustomPresets] = useState<CustomPresetSummary[]>([]);
  const [orgDefault, setOrgDefault] = useState<{ org_id: string; theme_id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openSheet, setOpenSheet] = useState<SheetId | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentOrgId = useMemo(() => (typeof window === 'undefined' ? null : getStoredOrgId()), []);

  const reload = async () => {
    if (!ready) return;
    try {
      const r = await authFetch('/api/themes/presets');
      if (r.ok) setCustomPresets(((await r.json()) as CustomPresetSummary[]) ?? []);
    } catch (err) {
      logger.warn('themes: failed to load presets', err);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch, ready]);

  useEffect(() => {
    if (!ready || !currentOrgId) return;
    void (async () => {
      try {
        const r = await authFetch(`/api/orgs/${currentOrgId}/theme`);
        if (r.ok) setOrgDefault((await r.json()) as { org_id: string; theme_id: string });
        const memResp = await authFetch(`/api/orgs/${currentOrgId}/members`);
        if (memResp.ok) {
          const members = (await memResp.json()) as { user_id: string; role: string }[];
          const meResp = await authFetch('/api/me');
          if (meResp.ok) {
            const me = (await meResp.json()) as { id?: string; user_id?: string };
            const myId = me.id ?? me.user_id;
            const my = members.find((m) => m.user_id === myId);
            setIsAdmin(my?.role === 'admin');
          }
        }
      } catch (err) {
        logger.warn('themes-settings: org load failed', err);
      }
    })();
  }, [authFetch, ready, currentOrgId]);

  const isFollowingOrg = preference.mode === 'org_default';
  const isSystem = preference.mode === 'system';
  // The persisted "active" — what's saved server-side (preview doesn't change this).
  const persistedId: ThemeId | null =
    preference.mode === 'explicit' ? (preference.theme_id ?? null) : null;
  const previewingId: ThemeId | null = preview?.id ?? null;

  const userCustoms = customPresets.filter((p) => p.scope === 'user');
  const orgCustoms = customPresets.filter((p) => p.scope === 'org' && p.org_id === currentOrgId);

  const open = (id: SheetId) => setOpenSheet(id);
  const close = () => setOpenSheet(null);

  const onDeleteCustom = async (preset: CustomPresetSummary) => {
    if (
      !confirm(
        `Delete "${preset.name}"? Members using this theme will fall back to the org default.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      const r = await authFetch(`/api/themes/presets/${preset.id}`, {
        method: 'DELETE',
      });
      if (r.status === 409) {
        setDeleteError(
          `"${preset.name}" is currently the organization default. Pick a different org default first, then try again.`,
        );
        return;
      }
      if (!r.ok) {
        setDeleteError(`Couldn't delete "${preset.name}" (${r.status}).`);
        return;
      }
      // If it was the user's active theme, fall back to org default.
      if (preference.mode === 'explicit' && preference.theme_id === `custom:${preset.id}`) {
        followOrgDefault();
      }
      await reload();
    } catch (err) {
      logger.warn('themes: delete failed', err);
      setDeleteError('Network error deleting theme.');
    }
  };

  return (
    // No wrapper around the shell: the deck lays a page out as a flex column
    // and the shell is what scrolls in it, so anything between the two takes
    // the scroll away and the tab runs off the bottom of the window.
    <>
      <SettingsPageShell active="/settings/appearance" maxWidth="max-w-6xl">
        <p className="mb-8 max-w-2xl text-sm font-body text-muted-foreground">
          How the window looks: pick a built-in theme, follow your organization's default, build a
          custom theme, brand the app from a website, or follow your system's light/dark setting —
          and choose what it shows while you are away.
        </p>

        {deleteError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/15 border border-destructive/40 text-[11px] font-body text-destructive flex items-start justify-between gap-3">
            <span className="flex-1">{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="shrink-0 text-destructive/70 hover:text-destructive"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Named, like the screensaver block below it: a grid of colours with
            no heading is the page's only unlabelled thing. */}
        <h2 className="mb-2 font-body text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Colour scheme
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {/* Built-ins */}
          {BUILTIN_ORDER.map((id) => (
            <BuiltInCard
              key={id}
              name={BUILTIN_PRESETS[id].name}
              tokens={BUILTIN_PRESETS[id].tokens}
              colorScheme={BUILTIN_PRESETS[id].color_scheme}
              active={persistedId === id && !previewingId}
              previewing={previewingId === id}
              onApply={() => previewTheme(id)}
              onClone={() => router.push(`/settings/themes/edit?from=${encodeURIComponent(id)}`)}
            />
          ))}

          {/* Match-system card — same preview-then-save flow as themes */}
          <SystemCard
            isActive={isSystem && !previewingId}
            activeScheme={colorScheme}
            onToggle={() => {
              if (isSystem) {
                // Already following; clicking again previews "stop following"
                // (i.e. previews dark as the explicit choice).
                previewTheme('preset:dark');
              } else {
                previewSystem('preset:light', 'preset:dark');
              }
            }}
          />

          {/* Org-default card — opens drawer */}
          <CompactCard
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
            title="Organization default"
            subtitle={
              isFollowingOrg
                ? `Following · ${labelForThemeId(orgDefault?.theme_id ?? 'preset:dark', customPresets)}`
                : `Inherit your org's theme — ${labelForThemeId(orgDefault?.theme_id ?? 'preset:dark', customPresets)}`
            }
            active={isFollowingOrg && !previewingId}
            onClick={() => open('org')}
          />

          {/* Custom themes */}
          {userCustoms.map((p) => {
            const id: ThemeId = `custom:${p.id}`;
            return (
              <CustomThemeCard
                key={p.id}
                preset={p}
                active={persistedId === id && !previewingId}
                previewing={previewingId === id}
                onApply={() => previewTheme(id)}
                onEdit={() => router.push(`/settings/themes/edit?id=${p.id}`)}
                onDelete={() => onDeleteCustom(p)}
              />
            );
          })}
          {orgCustoms.map((p) => {
            const id: ThemeId = `custom:${p.id}`;
            return (
              <CustomThemeCard
                key={p.id}
                preset={p}
                active={persistedId === id && !previewingId}
                previewing={previewingId === id}
                onApply={() => previewTheme(id)}
                onEdit={isAdmin ? () => router.push(`/settings/themes/edit?id=${p.id}`) : undefined}
                onDelete={isAdmin ? () => onDeleteCustom(p) : undefined}
              />
            );
          })}

          {/* + Custom theme — opens drawer (preset / brand-from-URL / blank) */}
          <CompactCard
            icon={<Plus className="h-4 w-4 text-foreground" />}
            title="New custom theme"
            subtitle={
              isAdmin
                ? 'Start from a preset, brand from a website, or open blank'
                : 'Build your own colors from scratch or a preset'
            }
            variant="plus"
            onClick={() => open('new-custom')}
          />
        </div>

        <SettingsCard className="mt-8" variant="flat">
          <SettingsSectionHeader
            title="Screensaver"
            subtitle="What the window shows when you have been away"
          />
          <div className="px-5 py-5">
            <ScreensaverSection />
          </div>
        </SettingsCard>

        <p className="text-[11px] font-body text-muted-foreground/60 mt-12">
          Active theme: <span className="text-foreground">{themeId}</span>
        </p>
      </SettingsPageShell>

      {/* Right-side drawers */}
      <Sheet open={openSheet === 'org'} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Organization default</SheetTitle>
            <SheetDescription>Inherit the theme set by your organization admin.</SheetDescription>
          </SheetHeader>
          <OrgDefaultPanel
            isActive={isFollowingOrg}
            isAdmin={isAdmin}
            orgDefault={orgDefault}
            customs={customPresets}
            onUse={() => {
              followOrgDefault();
              close();
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={openSheet === 'new-custom'} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" width="wide">
          <SheetHeader>
            <SheetTitle>New custom theme</SheetTitle>
            <SheetDescription>
              Pick a starting palette, brand from a website, or open the editor blank.
            </SheetDescription>
          </SheetHeader>
          <NewCustomPanel
            isOpen={openSheet === 'new-custom'}
            isAdmin={isAdmin}
            currentOrgId={currentOrgId}
            authFetch={authFetch}
            onChoosePreset={(id) =>
              router.push(`/settings/themes/edit?from=${encodeURIComponent(id)}`)
            }
            onBlank={() => router.push('/settings/themes/edit')}
            onBrandApplied={(tid) => {
              setExplicit(tid);
              close();
              window.dispatchEvent(new Event('brand-updated'));
              void reload();
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Card components
// ──────────────────────────────────────────────────────────────────────────

function BuiltInCard({
  name,
  tokens,
  colorScheme,
  active,
  previewing = false,
  onApply,
  onClone,
}: {
  name: string;
  tokens: Record<string, string>;
  colorScheme: ColorScheme;
  active: boolean;
  previewing?: boolean;
  onApply: () => void;
  onClone?: () => void;
}) {
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-lg border transition-colors ${
        previewing
          ? 'border-warning ring-2 ring-warning/60'
          : active
            ? 'border-primary ring-1 ring-primary'
            : 'border-border hover:border-primary/40'
      }`}
    >
      {/* The colour is the tile: filling the row's height is what keeps a
          short one from ending in the page's own background. */}
      <button type="button" onClick={onApply} className="flex flex-1 text-left">
        <div
          className="flex flex-1 flex-col gap-2 p-3"
          style={{ background: tokens['background'], color: tokens['foreground'] }}
        >
          <div className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[12px] font-body font-medium"
              style={{ color: tokens['foreground'] }}
            >
              {name}
            </span>
            {colorScheme === 'dark' ? (
              <Moon className="h-3 w-3 shrink-0" style={{ color: tokens['muted-foreground'] }} />
            ) : (
              <Sun className="h-3 w-3 shrink-0" style={{ color: tokens['muted-foreground'] }} />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="font-display text-base leading-none italic"
              style={{ color: tokens['primary'] }}
            >
              Aa
            </span>
            <span className="flex flex-1 justify-end gap-1">
              <Swatch color={tokens['primary']} />
              <Swatch color={tokens['accent-foreground']} />
              <Swatch color={tokens['destructive']} />
              <Swatch color={tokens['chart-2']} />
              <Swatch color={tokens['chart-3']} />
            </span>
          </div>
        </div>
      </button>
      {previewing && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-body uppercase tracking-wider bg-warning text-warning-foreground border border-warning pointer-events-none">
          Previewing
        </div>
      )}
      {!previewing && active && (
        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center pointer-events-none">
          <Check className="h-2.5 w-2.5" />
        </div>
      )}
      {onClone && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClone();
          }}
          className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-body bg-card/95 border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 backdrop-blur shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1"
          title="Clone as a custom theme"
          aria-label={`Clone ${name} as a custom theme`}
        >
          <Copy className="h-3 w-3" />
          Clone
        </button>
      )}
    </div>
  );
}

function CustomThemeCard({
  preset,
  active,
  previewing = false,
  onApply,
  onEdit,
  onDelete,
}: {
  preset: CustomPresetSummary;
  active: boolean;
  previewing?: boolean;
  onApply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`relative border rounded-lg p-3 transition-colors ${
        previewing
          ? 'border-warning ring-2 ring-warning/60'
          : active
            ? 'border-primary ring-1 ring-primary'
            : 'border-border hover:border-primary/40'
      }`}
    >
      <button type="button" onClick={onApply} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-body font-medium text-foreground">
            {preset.name}
          </span>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {preset.scope === 'org' ? 'Shared' : 'Personal'}
          </span>
        </div>
        <p className="mt-0.5 mb-2 text-[10px] font-body text-muted-foreground/70">
          Custom · {preset.color_scheme}
        </p>
      </button>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-body text-muted-foreground/50 truncate flex-1">
          {preset.base_preset?.replace('preset:', 'from ') ?? 'Custom'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="px-2 py-0.5 rounded text-[10px] font-body border border-border hover:border-destructive/50 text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1"
              title="Delete"
            >
              <Trash2 className="h-2.5 w-2.5" />
              Delete
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="px-2 py-0.5 rounded text-[10px] font-body border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              title="Edit"
            >
              <Pencil className="h-2.5 w-2.5" />
              Edit
            </button>
          )}
        </div>
      </div>
      {previewing && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-body uppercase tracking-wider bg-warning text-warning-foreground border border-warning pointer-events-none">
          Previewing
        </div>
      )}
      {!previewing && active && (
        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
          <Check className="h-2.5 w-2.5" />
        </div>
      )}
    </div>
  );
}

function CompactCard({
  icon,
  title,
  subtitle,
  active = false,
  variant = 'default',
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  variant?: 'default' | 'plus';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-lg border bg-card p-3 text-left flex items-start gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
      }`}
    >
      <div
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
          variant === 'plus' ? 'border border-dashed border-border bg-background' : 'bg-secondary'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="truncate text-[12px] font-body font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-[10.5px] font-body leading-snug text-muted-foreground/80">
          {subtitle}
        </p>
      </div>
      {active && (
        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center pointer-events-none">
          <Check className="h-2.5 w-2.5" />
        </div>
      )}
    </button>
  );
}

function SystemCard({
  isActive,
  activeScheme,
  onToggle,
}: {
  isActive: boolean;
  activeScheme: ColorScheme;
  onToggle: () => void;
}) {
  const ResolvedIcon = activeScheme === 'dark' ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative rounded-lg border bg-card p-3 text-left flex items-start gap-2.5 transition-colors ${
        isActive ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-secondary">
        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[12px] font-body font-medium text-foreground">Match my system</h3>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-body uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
              <ResolvedIcon className="h-2.5 w-2.5" />
              {activeScheme === 'dark' ? 'Dark' : 'Light'} now
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10.5px] font-body leading-snug text-muted-foreground/80">
          {isActive
            ? `Following your OS — currently ${activeScheme}. Click to stop.`
            : 'Auto-switch between Light & Dark with your OS'}
        </p>
      </div>
      {isActive && (
        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
          <Check className="h-2.5 w-2.5" />
        </div>
      )}
    </button>
  );
}

function OrgDefaultPanel({
  isActive,
  isAdmin,
  orgDefault,
  customs,
  onUse,
}: {
  isActive: boolean;
  isAdmin: boolean;
  orgDefault: { theme_id: string } | null;
  customs: CustomPresetSummary[];
  onUse: () => void;
}) {
  const label = orgDefault ? labelForThemeId(orgDefault.theme_id, customs) : 'Dark';
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <p className="text-[11px] font-body text-muted-foreground/80 mb-1">Currently set to</p>
        <p className="text-base font-body font-medium text-foreground">{label}</p>
      </div>
      <p className="text-[11px] font-body text-muted-foreground/80">
        New members see this theme until they pick their own. You can stop following at any time by
        picking another theme from the grid.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {!isActive ? (
          <button
            type="button"
            onClick={onUse}
            className="px-3 py-1.5 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
          >
            <Check className="h-3 w-3" />
            Use org default
          </button>
        ) : (
          <span className="px-3 py-1.5 rounded text-[11px] font-body border border-success/40 bg-success/10 text-success inline-flex items-center gap-1.5">
            <Check className="h-3 w-3" />
            Following org default
          </span>
        )}
        {isAdmin && (
          <Link
            href="/settings/organization/themes"
            className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage org default →
          </Link>
        )}
      </div>
    </div>
  );
}

function NewCustomPanel({
  isOpen,
  isAdmin,
  currentOrgId,
  authFetch,
  onChoosePreset,
  onBlank,
  onBrandApplied,
}: {
  isOpen: boolean;
  isAdmin: boolean;
  currentOrgId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onChoosePreset: (id: BuiltInPresetId) => void;
  onBlank: () => void;
  onBrandApplied: (themeId: ThemeId) => void;
}) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('dark');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<BrandSuggestionPayload | null>(null);
  // User-editable overrides on top of the AI suggestion.
  const [editAppName, setEditAppName] = useState('');
  const [editTagline, setEditTagline] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const brandInputRef = useRef<HTMLInputElement | null>(null);
  const logoFileRef = useRef<HTMLInputElement | null>(null);

  // Reset when the drawer closes.
  useEffect(() => {
    if (!isOpen) {
      setSuggestion(null);
      setBrandError(null);
      setEditAppName('');
      setEditTagline('');
      setEditLogoUrl(null);
    }
  }, [isOpen]);

  // Seed editable fields from the suggestion the first time it lands.
  useEffect(() => {
    if (suggestion) {
      setEditAppName(suggestion.app_name ?? '');
      setEditTagline(suggestion.tagline ?? '');
      setEditLogoUrl(suggestion.logo_url ?? null);
    }
  }, [suggestion]);

  const onLogoUpload = async (file: File) => {
    if (!currentOrgId) return;
    setUploadingLogo(true);
    setBrandError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/logo`, {
        method: 'POST',
        body: fd,
      });
      if (!r.ok) {
        setBrandError(`Logo upload failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { url: string };
      setEditLogoUrl(data.url);
    } catch (err) {
      logger.warn('brand: logo upload failed', err);
      setBrandError('Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  const onAnalyze = async () => {
    if (!currentOrgId || !websiteUrl) {
      setBrandError('Enter a website URL');
      return;
    }
    setAnalyzing(true);
    setBrandError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/generate`, {
        method: 'POST',
        body: JSON.stringify({ url: websiteUrl, color_scheme: colorScheme }),
      });
      if (!r.ok) {
        setBrandError(`Couldn't analyze (${r.status}). Try the brand studio for full options.`);
        return;
      }
      setSuggestion((await r.json()) as BrandSuggestionPayload);
    } catch (err) {
      logger.warn('brand: analyze failed', err);
      setBrandError('Network error');
    } finally {
      setAnalyzing(false);
    }
  };

  const onApply = async () => {
    if (!currentOrgId || !suggestion) return;
    const finalAppName = editAppName.trim() || suggestion.app_name || 'Brand';
    setApplying(true);
    setBrandError(null);
    try {
      const r = await authFetch(`/api/orgs/${currentOrgId}/brand/apply`, {
        method: 'POST',
        body: JSON.stringify({
          app_name: finalAppName,
          tagline: editTagline.trim() || null,
          logo_url: editLogoUrl,
          favicon_url: suggestion.favicon_url,
          source_url: suggestion.source_url,
          theme_name: `${finalAppName} brand`,
          theme: {
            version: 1,
            name: finalAppName,
            base_preset: suggestion.theme.base_preset,
            color_scheme: suggestion.theme.color_scheme,
            tokens: suggestion.theme.tokens,
          },
        }),
      });
      if (!r.ok) {
        setBrandError(`Apply failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { theme_id: string };
      onBrandApplied(data.theme_id as ThemeId);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 flex flex-col gap-6">
      {/* Path 1: presets */}
      <div>
        <h3 className="text-[11px] font-body uppercase tracking-wider text-muted-foreground/70 mb-3">
          Start from a preset
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BUILTIN_ORDER.map((id) => {
            const tokens = BUILTIN_PRESETS[id].tokens;
            const scheme = BUILTIN_PRESETS[id].color_scheme;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChoosePreset(id)}
                className="rounded-lg overflow-hidden border border-border hover:border-primary/50 hover:shadow-lg transition-all text-left group"
              >
                <div
                  className="p-4 flex flex-col gap-3"
                  style={{ background: tokens['background'], color: tokens['foreground'] }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-body font-medium"
                      style={{ color: tokens['foreground'] }}
                    >
                      {BUILTIN_PRESETS[id].name}
                    </span>
                    {scheme === 'dark' ? (
                      <Moon className="h-3.5 w-3.5" style={{ color: tokens['muted-foreground'] }} />
                    ) : (
                      <Sun className="h-3.5 w-3.5" style={{ color: tokens['muted-foreground'] }} />
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tokens['primary'] }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tokens['destructive'] }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tokens['chart-2'] }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tokens['chart-3'] }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tokens['chart-4'] }}
                    />
                  </div>
                  <div className="flex items-end justify-between">
                    <span
                      className="font-display italic text-3xl leading-none"
                      style={{ color: tokens['primary'] }}
                    >
                      Aa
                    </span>
                    <span
                      className="text-[10px] font-body opacity-60"
                      style={{ color: tokens['muted-foreground'] }}
                    >
                      Click to edit →
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Path 2: brand from website (admin only) */}
      {isAdmin && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
            <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-primary/15 border border-primary/30">
              <Wand2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-body font-medium text-foreground">
                Brand from a website
              </h3>
              <p className="text-[11px] font-body text-muted-foreground/80 mt-0.5">
                Paste a URL — the AI extracts colors, logo, and a name into a custom theme.
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-4 space-y-4">
            <div>
              <label className="block text-[11px] font-body text-muted-foreground mb-1.5">
                Company website
              </label>
              <input
                ref={brandInputRef}
                type="url"
                value={websiteUrl}
                onChange={(e) => {
                  setWebsiteUrl(e.target.value);
                  if (brandError) setBrandError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && websiteUrl && !analyzing) {
                    e.preventDefault();
                    void onAnalyze();
                  }
                }}
                placeholder="https://example.com"
                className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-foreground text-sm font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-body text-muted-foreground mb-1.5">
                Theme mode
              </label>
              <div className="inline-flex border border-border rounded-md overflow-hidden">
                {(['light', 'dark'] as ColorScheme[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColorScheme(s)}
                    className={`px-4 py-1.5 text-[11px] font-body capitalize transition-colors inline-flex items-center gap-1.5 ${
                      colorScheme === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s === 'light' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzing || !websiteUrl.trim()}
              className="w-full px-4 py-2.5 rounded-md text-sm font-body font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-sm"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing brand…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze brand
                </>
              )}
            </button>
            {brandError && (
              <div className="px-3 py-2 rounded bg-destructive/15 border border-destructive/40 text-[11px] font-body text-destructive">
                {brandError}
              </div>
            )}
            {suggestion && (
              <div className="rounded-lg border border-border bg-background p-4 space-y-4">
                {/* AI reasoning + colour preview swatches */}
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    {['primary', 'destructive', 'chart-2', 'chart-3', 'chart-4'].map((k) => (
                      <span
                        key={k}
                        className="w-5 h-5 rounded-full border border-black/10"
                        style={{ background: suggestion.theme.tokens[k] }}
                      />
                    ))}
                  </div>
                  {suggestion.reasoning && (
                    <p className="text-[11px] font-body italic text-muted-foreground flex-1">
                      "{suggestion.reasoning}"
                    </p>
                  )}
                </div>

                {/* App name */}
                <div>
                  <label className="block text-[11px] font-body text-muted-foreground mb-1">
                    App name (shown to members)
                  </label>
                  <input
                    type="text"
                    value={editAppName}
                    onChange={(e) => setEditAppName(e.target.value)}
                    placeholder={suggestion.app_name ?? 'App name'}
                    maxLength={100}
                    className="w-full px-3 py-2 rounded border border-border bg-card text-foreground text-xs font-body focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Tagline */}
                <div>
                  <label className="block text-[11px] font-body text-muted-foreground mb-1">
                    Tagline (optional)
                  </label>
                  <input
                    type="text"
                    value={editTagline}
                    onChange={(e) => setEditTagline(e.target.value)}
                    placeholder={suggestion.tagline ?? 'Short tagline'}
                    maxLength={200}
                    className="w-full px-3 py-2 rounded border border-border bg-card text-foreground text-xs font-body focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-[11px] font-body text-muted-foreground mb-1.5">
                    Logo
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden shrink-0">
                      {editLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={editLogoUrl}
                          alt="brand logo"
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <button
                        type="button"
                        onClick={() => logoFileRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                      >
                        {uploadingLogo ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Upload className="h-3 w-3" />
                            {editLogoUrl ? 'Replace' : 'Upload'}
                          </>
                        )}
                      </button>
                      {editLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setEditLogoUrl(null)}
                          className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-destructive/50 text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      )}
                      {suggestion.logo_url && editLogoUrl !== suggestion.logo_url && (
                        <button
                          type="button"
                          onClick={() => setEditLogoUrl(suggestion.logo_url ?? null)}
                          className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Use AI-extracted
                        </button>
                      )}
                      <input
                        ref={logoFileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onLogoUpload(file);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Apply */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                  <button
                    type="button"
                    onClick={onApply}
                    disabled={applying || !editAppName.trim()}
                    className="px-4 py-2 rounded text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {applying ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <Check className="h-3 w-3" />
                        Save brand & apply
                      </>
                    )}
                  </button>
                  <Link
                    href="/settings/organization/brand"
                    className="px-3 py-1.5 rounded text-[11px] font-body border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Fine-tune in studio →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Path 3: blank editor */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-body uppercase tracking-wider text-muted-foreground/60">
          or
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <button
        type="button"
        onClick={onBlank}
        className="w-full px-4 py-3 rounded-lg text-xs font-body border border-dashed border-border hover:border-primary/50 hover:bg-card text-foreground transition-colors inline-flex items-center justify-center gap-2"
      >
        <Plus className="h-3.5 w-3.5" />
        Open the editor blank
      </button>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-3.5 w-3.5 rounded-full border border-black/10"
      style={{ background: color }}
    />
  );
}

function labelForThemeId(id: string, customs: CustomPresetSummary[]): string {
  if (id.startsWith('preset:')) {
    const found = (BUILTIN_PRESETS as Record<string, { name: string }>)[id];
    return found?.name ?? id;
  }
  if (id.startsWith('custom:')) {
    const cid = id.slice('custom:'.length);
    const found = customs.find((c) => c.id === cid);
    return found?.name ?? 'Custom theme';
  }
  return id;
}
