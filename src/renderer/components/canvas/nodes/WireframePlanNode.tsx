'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useState } from 'react';

export type ScreenKind = 'screen' | 'modal' | 'drawer' | 'popover';
export type ScreenTier = 'hero' | 'secondary' | 'optional';
export type ScreenStatus = 'pending' | 'approved' | 'generated' | 'removed' | 'failed';

export interface PlanScreen {
  id: string;
  name: string;
  intent: string;
  kind: ScreenKind;
  tier: ScreenTier;
  archetype_source: string | null;
  domain_source: boolean;
  status: ScreenStatus;
}

export interface PlanData {
  archetypes: [string, number][];
  screens: PlanScreen[];
  inferred_at: string;
  last_edited_at: string;
}

export interface ScreenPatch {
  id: string;
  name?: string;
  intent?: string;
  kind?: ScreenKind;
  tier?: ScreenTier;
  status?: ScreenStatus;
}

export interface WireframePlanActions {
  onPatch?: (patches: ScreenPatch[]) => void | Promise<void>;
  onGenerate?: (tier: ScreenTier | 'all', screenIds?: string[]) => void | Promise<void>;
  onAddScreen?: () => void;
  generatingTier?: ScreenTier | 'all' | null;
}

interface WireframePlanNodeData extends WireframePlanActions {
  plan: PlanData;
  [k: string]: unknown;
}

const TIER_ORDER: ScreenTier[] = ['hero', 'secondary', 'optional'];

const TIER_LABEL: Record<ScreenTier, string> = {
  hero: 'Hero',
  secondary: 'Secondary',
  optional: 'Optional',
};

const KIND_BADGE: Record<ScreenKind, string> = {
  screen: 'Screen',
  modal: 'Modal',
  drawer: 'Drawer',
  popover: 'Popover',
};

function ScreenRow({
  screen,
  onPatch,
}: {
  screen: PlanScreen;
  onPatch?: (patches: ScreenPatch[]) => void | Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(screen.name);
  const removed = screen.status === 'removed';

  const commitName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== screen.name && onPatch) {
      onPatch([{ id: screen.id, name: trimmed }]);
    } else {
      setDraftName(screen.name);
    }
  };

  return (
    <div
      className="nodrag"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px',
        borderRadius: 6,
        background: removed ? 'rgba(239,68,68,0.04)' : 'transparent',
        border: '1px solid transparent',
        transition: 'background 120ms',
        opacity: removed ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (!removed) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!removed) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ minWidth: 0 }}>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setDraftName(screen.name); setEditingName(false); }
            }}
            style={{
              width: '100%',
              background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--foreground)',
              outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={() => !removed && setEditingName(true)}
            title={removed ? 'Removed' : 'Click to rename'}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--foreground)',
              textDecoration: removed ? 'line-through' : 'none',
              cursor: removed ? 'default' : 'text',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {screen.name}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.35 }}>
          {screen.intent}
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '3px 7px',
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
          color: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {KIND_BADGE[screen.kind]}
      </div>
      <StatusPill screen={screen} />
      {removed ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPatch?.([{ id: screen.id, status: 'pending' }]);
          }}
          title="Restore"
          style={removeBtnStyle('restore')}
        >
          ↶
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPatch?.([{ id: screen.id, status: 'removed' }]);
          }}
          title="Remove from plan"
          style={removeBtnStyle('remove')}
        >
          ×
        </button>
      )}
    </div>
  );
}

function StatusPill({ screen }: { screen: PlanScreen }) {
  // Status takes priority over the domain marker. Reading top-down:
  //   approved  → queued/in-flight (amber, animated dot)
  //   generated → done (green check)
  //   else if domain_source → domain marker (the original badge)
  //   else      → empty cell (preserves grid alignment)
  const baseStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '3px 7px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  };
  if (screen.status === 'approved') {
    return (
      <div
        title="Queued for generation"
        style={{
          ...baseStyle,
          background: 'rgba(229,166,48,0.16)',
          color: 'rgba(229,166,48,0.95)',
          border: '1px solid rgba(229,166,48,0.35)',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(229,166,48,0.95)',
            animation: 'wf-plan-pulse 1.2s ease-in-out infinite',
          }}
        />
        Queued
      </div>
    );
  }
  if (screen.status === 'generated') {
    return (
      <div
        title="Wireframe generated — view it on the canvas"
        style={{
          ...baseStyle,
          background: 'rgba(34,197,94,0.12)',
          color: 'rgba(74,222,128,0.95)',
          border: '1px solid rgba(34,197,94,0.30)',
        }}
      >
        ✓ Done
      </div>
    );
  }
  if (screen.status === 'failed') {
    return (
      <div
        title="Generation failed for this screen — retry from the menu"
        style={{
          ...baseStyle,
          background: 'rgba(239,68,68,0.14)',
          color: 'rgba(248,113,113,0.95)',
          border: '1px solid rgba(239,68,68,0.35)',
        }}
      >
        ⚠ Failed
      </div>
    );
  }
  if (screen.domain_source) {
    return (
      <div
        title="Domain-specific (extracted from your brief)"
        style={{
          ...baseStyle,
          background: 'rgba(229,166,48,0.12)',
          color: 'rgba(229,166,48,0.9)',
          border: '1px solid rgba(229,166,48,0.25)',
        }}
      >
        Domain
      </div>
    );
  }
  return <div />;
}


function removeBtnStyle(_kind: 'remove' | 'restore'): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'color-mix(in srgb, var(--foreground) 2%, transparent)',
    color: 'var(--muted-foreground)',
    fontSize: 14,
    fontWeight: 400,
    cursor: 'pointer',
    transition: 'all 100ms',
  };
  return base;
}

function TierSection({
  tier,
  screens,
  onPatch,
  onGenerate,
  generatingTier,
}: {
  tier: ScreenTier;
  screens: PlanScreen[];
  onPatch?: (patches: ScreenPatch[]) => void | Promise<void>;
  onGenerate?: (tier: ScreenTier | 'all', screenIds?: string[]) => void | Promise<void>;
  generatingTier?: ScreenTier | 'all' | null;
}) {
  if (screens.length === 0) return null;
  const active = screens.filter((s) => s.status !== 'removed');
  // Derive in-flight state from BOTH the explicit click marker AND the
  // screen statuses themselves. Screens marked `approved` are queued for
  // (or actively running through) generation — without this, a chat-
  // driven auto-expansion runs hero in the background while the plan
  // card stupidly says "Generate Hero" still clickable.
  const anyApproved = active.some((s) => s.status === 'approved');
  const isGenerating =
    generatingTier === tier
    || generatingTier === 'all'
    || anyApproved;
  const allGenerated = active.length > 0 && active.every((s) => s.status === 'generated');
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 10px 8px',
          marginBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:
              tier === 'hero' ? 'rgba(229,166,48,0.85)' :
              tier === 'secondary' ? 'var(--muted-foreground)' :
              'var(--muted-foreground)',
          }}
        >
          {TIER_LABEL[tier]} · {active.length}
        </div>
        {onGenerate && active.length > 0 && (
          <button
            className="nodrag"
            disabled={isGenerating || allGenerated}
            onClick={(e) => {
              e.stopPropagation();
              onGenerate(tier);
            }}
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid rgba(229,166,48,0.3)',
              background: isGenerating ? 'rgba(229,166,48,0.08)' : 'rgba(229,166,48,0.04)',
              color: 'rgba(229,166,48,0.85)',
              cursor: isGenerating || allGenerated ? 'default' : 'pointer',
              opacity: allGenerated ? 0.4 : 1,
            }}
          >
            {allGenerated ? 'Generated' : isGenerating ? 'Generating…' : `Generate ${TIER_LABEL[tier]}`}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {screens.map((s) => (
          <ScreenRow key={s.id} screen={s} onPatch={onPatch} />
        ))}
      </div>
    </div>
  );
}

interface WireframePlanPanelProps extends WireframePlanActions {
  plan: PlanData;
  /** When rendered inside the Inspector drawer the outer container has no
   *  card chrome — drop the panel's bg/border/shadow and let the drawer
   *  shell own the framing. The canvas-node variant keeps the chrome. */
  embedded?: boolean;
}

const PULSE_KEYFRAMES_ID = "wf-plan-pulse-keyframes";
function injectPulseKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PULSE_KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_KEYFRAMES_ID;
  style.textContent =
    "@keyframes wf-plan-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }";
  document.head.appendChild(style);
}

export function WireframePlanPanel({
  plan,
  onPatch,
  onGenerate,
  onAddScreen,
  generatingTier,
  embedded = false,
}: WireframePlanPanelProps) {
  injectPulseKeyframes();
  if (!plan || !plan.screens) return null;

  const grouped: Record<ScreenTier, PlanScreen[]> = { hero: [], secondary: [], optional: [] };
  for (const s of plan.screens) grouped[s.tier].push(s);

  const archetypeBadges = (plan.archetypes || [])
    .filter(([, conf]) => conf >= 0.3)
    .slice(0, 3);

  return (
    <div
      style={{
        background: embedded ? 'transparent' : 'var(--card)',
        border: embedded ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: embedded ? 0 : 12,
        padding: embedded ? '12px 16px 16px' : '18px 20px 16px',
        width: embedded ? '100%' : 560,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxShadow: embedded ? 'none' : '0 4px 24px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              marginBottom: 4,
            }}
          >
            Inferred Plan
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
            {(() => {
              const active = plan.screens.filter((s) => s.status !== 'removed');
              const generated = active.filter((s) => s.status === 'generated').length;
              const failed = active.filter((s) => s.status === 'failed').length;
              const anyDone = generated > 0 || failed > 0;
              if (!anyDone) {
                return (
                  <>
                    {active.length} screens ·{' '}
                    <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                      edit before generating
                    </span>
                  </>
                );
              }
              return (
                <>
                  {generated} / {active.length} screens
                  {failed > 0 && (
                    <span style={{ fontWeight: 500, color: 'rgba(248,113,113,0.85)', fontSize: 13, marginLeft: 8 }}>
                      · {failed} failed
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 240 }}>
          {archetypeBadges.map(([name, conf]) => (
            <div
              key={name}
              title={`Confidence: ${(conf * 100).toFixed(0)}%`}
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(94,106,210,0.10)',
                color: 'rgba(160,170,250,0.9)',
                border: '1px solid rgba(94,106,210,0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
      {TIER_ORDER.map((tier) => (
        <TierSection
          key={tier}
          tier={tier}
          screens={grouped[tier]}
          onPatch={onPatch}
          onGenerate={onGenerate}
          generatingTier={generatingTier}
        />
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          marginTop: 4,
        }}
      >
        <button
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            onAddScreen?.();
          }}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.55)',
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          + Add screen
        </button>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          Plan persists across reloads
        </div>
      </div>
    </div>
  );
}

function WireframePlanNodeComponent({ data }: NodeProps) {
  const d = data as WireframePlanNodeData;
  if (!d.plan || !d.plan.screens) return null;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
      <WireframePlanPanel
        plan={d.plan}
        onPatch={d.onPatch}
        onGenerate={d.onGenerate}
        onAddScreen={d.onAddScreen}
        generatingTier={d.generatingTier}
      />
    </>
  );
}

export const WireframePlanNode = memo(WireframePlanNodeComponent);
