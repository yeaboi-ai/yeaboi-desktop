'use client';

// The plan room: the conversation as a centred reading column, the stage
// strip over it, one composer under it, and a strip of drawers on the right
// edge. The call, its recap and the facilitator's voice settings hang off a
// vendored session row made the first time one of them is opened. Bare: no
// rail, no frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { AllTipsSheet } from '@/components/yeaboi/all-tips-sheet';
import { Composer, type ComposerHandle } from '@/components/planning/composer';
import { DrawerStrip } from '@/components/planning/drawer-strip';
import { QuestionsPanel } from '@/components/planning/questions-panel';
import { RoomDrawer } from '@/components/planning/room-drawer';
import { StageStrip } from '@/components/planning/stage-strip';
import { Transcript } from '@/components/planning/transcript';
import { BlueprintDrawer } from '@/components/planning/drawers/blueprint-drawer';
import { ContextDrawer } from '@/components/planning/drawers/context-drawer';
import { IntegrationsDrawer } from '@/components/planning/drawers/integrations-drawer';
import { RecapDrawer } from '@/components/planning/drawers/recap-drawer';
import { SettingsDrawer } from '@/components/planning/drawers/settings-drawer';
import { VideoDrawer } from '@/components/planning/drawers/video-drawer';
import { CallLayer } from '@/components/session/call-layer';
import { useAudience } from '@/components/providers/audience-provider';
import { usePlanChat } from '@/hooks/planning/use-plan-chat';
import { useRoomLink } from '@/hooks/planning/use-room-link';
import { useRoomVoice } from '@/hooks/planning/use-room-voice';
import { SOCKET_DRAWERS, roomKey, toggleDrawer, type DrawerKind } from '@/lib/planning/drawers';
import { roomLayout } from '@/lib/planning/room-layout';
import { stageStep, stageWord } from '@/lib/planning/stages';
import { personaName } from '@/lib/planning/voice';
import { apiGet } from '@/lib/yeaboi/api';
import { allCards, loadCapabilities, type ModeCard } from '@/lib/yeaboi/capabilities';
import { isTyping } from '@/lib/yeaboi/palette';
import { openShortcuts } from '@/lib/yeaboi/palette';
import { tipsForAudience, type Tip } from '@/lib/yeaboi/tips';

const HINTS: Record<string, string> = {
  intake: 'Answer, or / for commands',
  review: 'accept, or say what to change',
  epic: 'accept, or say what to change',
  chat: 'Ask anything about the plan',
};

/** The window's width, for the layout that arranges the drawer around the chat. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function EditableTitle({ title, onSave }: { title: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft.trim() !== title) onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
        aria-label="Plan name"
        className="min-w-0 flex-1 bg-transparent font-display text-[18px] text-foreground focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      title="Rename"
      className="min-w-0 truncate text-left font-display text-[18px] text-foreground hover:text-primary"
    >
      {title || 'Untitled plan'}
    </button>
  );
}

function RoomBody({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { audience } = useAudience();
  const chat = usePlanChat(sessionId);
  const { room, view, plan } = chat;
  const link = useRoomLink(sessionId, view?.title ?? '', view?.opening ?? '');
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(0);
  const windowWidth = useWindowWidth();
  // Push the column aside while it keeps its reading width; slide over its
  // edge once it would not.
  const layout = roomLayout(windowWidth, drawer ? drawerWidth : 0);
  const voice = useRoomVoice(link, drawer !== null && SOCKET_DRAWERS.has(drawer));
  const [pane, setPane] = useState<'plan' | 'history' | 'export'>('plan');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const [cards, setCards] = useState<ModeCard[]>([]);
  const composer = useRef<ComposerHandle>(null);

  const toggle = useCallback(
    (kind: DrawerKind) => setDrawer((open) => toggleDrawer(open, kind)),
    [],
  );

  // A turn that asked for something the drawer does: /export, a sync at a gate.
  const { want, clearWant } = chat;
  useEffect(() => {
    if (!want) return;
    setPane('export');
    setDrawer('blueprint');
    clearWant();
    // The hook hands out a fresh clearWant each render; the want is the signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const action = roomKey(event.key, isTyping(event.target));
      if (!action) return;
      if (action.type === 'close') {
        if (drawer) setDrawer(null);
        return;
      }
      event.preventDefault();
      if (action.type === 'shortcuts') openShortcuts();
      else toggle(action.kind);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, toggle]);

  useEffect(() => {
    if (!tipsOpen || tips.length) return;
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
    loadCapabilities().then(
      (caps) => setCards(allCards(caps)),
      () => undefined,
    );
  }, [tipsOpen, tips.length]);

  const reply = (text: string) => {
    if (text.endsWith(' ')) {
      chat.setDraft(text);
      composer.current?.focus();
    } else void chat.submit(text);
  };

  const ensureProject = useCallback(async () => (await link.ensure())?.id ?? null, [link]);

  if (chat.loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-[22px] text-foreground">This plan could not be opened.</p>
        <p className="max-w-md text-[13px] text-muted-foreground">
          {chat.loadError}. A plan from before the redesign is not here any more; its export, if you
          made one, still is.
        </p>
        <button
          type="button"
          onClick={() => navigate('/planning')}
          className="text-[13px] text-primary hover:underline"
        >
          Back to Planning
        </button>
      </div>
    );
  }

  const asked = Boolean(room.question?.current_question);
  const step = stageStep(room.stage, asked);
  const hint = HINTS[room.stage] ?? 'Reply, or / for commands';

  return (
    <div className="relative flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <button
            type="button"
            onClick={() => navigate('/planning')}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
          <EditableTitle title={view?.title ?? ''} onSave={(next) => void chat.rename(next)} />
          <span className="text-[12px] text-muted-foreground">{stageWord(room.stage, asked)}</span>
          <div className="flex-1" />
          {voice.call.inCall ? (
            <button
              type="button"
              onClick={voice.endCall}
              className="rounded-lg border border-border/60 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-secondary"
            >
              Leave{voice.call.timer ? ` ${voice.call.timer}` : ''}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDrawer('video');
                void voice.startCall();
              }}
              disabled={voice.joining}
              className="rounded-lg border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              {voice.joining ? 'Joining…' : 'Call'}
            </button>
          )}
          <button
            type="button"
            disabled={!(room.stage === 'review' || room.stage === 'chat')}
            onClick={() => navigate(`/planning/${encodeURIComponent(sessionId)}/completed`)}
            className="border-b pb-px text-[12px] text-foreground transition-colors hover:text-primary disabled:opacity-40"
            style={{ borderBottomColor: 'var(--audience-accent)' }}
          >
            Wrap up
          </button>
        </header>

        <div
          className="mx-auto flex w-full min-h-0 flex-1 flex-col"
          style={{ maxWidth: 'var(--room-w, 44rem)' }}
        >
          <div className="px-6 pt-4">
            <StageStrip step={step} />
          </div>
          <Transcript
            room={room}
            plan={plan}
            replies={chat.replies}
            onReply={reply}
            onOpenBlueprint={() => {
              setPane('plan');
              setDrawer('blueprint');
            }}
          />
          {room.stalled && !room.busy && (
            <div className="px-6 pb-2">
              <button
                type="button"
                onClick={() => void chat.advance()}
                className="border-b pb-px text-[13px] text-foreground hover:text-primary"
                style={{ borderBottomColor: 'var(--audience-accent)' }}
              >
                Continue
              </button>
              <span className="ml-3 text-[12px] text-muted-foreground">
                picks the plan up where the last step stopped
              </span>
            </div>
          )}
          <Composer
            ref={composer}
            draft={chat.draft}
            onDraft={chat.setDraft}
            onSubmit={(line) => void chat.submit(line)}
            onPaste={(event) => void chat.paste(event)}
            onStop={() => void chat.cancel()}
            busy={room.busy}
            attachments={room.attachments.length}
            hint={hint}
          />
        </div>
      </div>

      <div
        className={
          layout.mode === 'overlay' && drawer ? 'absolute inset-y-0 right-11 z-30' : 'contents'
        }
      >
        <RoomDrawer kind={drawer} onClose={() => setDrawer(null)} onWidth={setDrawerWidth}>
          {drawer === 'blueprint' && (
            <BlueprintDrawer
              sessionId={sessionId}
              plan={plan}
              busy={room.busy}
              onSend={(text) => void chat.submit(text)}
              pane={pane}
              onPane={setPane}
              projectId={link.vendoredId ?? undefined}
              ensureProject={ensureProject}
            />
          )}
          {drawer === 'context' && (
            <ContextDrawer sessionId={sessionId} view={view} onSaved={chat.patchView} />
          )}
          {drawer === 'integrations' && <IntegrationsDrawer />}
          {drawer === 'video' && <VideoDrawer link={link} voice={voice} />}
          {drawer === 'recap' && (
            <RecapDrawer
              bubbles={room.bubbles}
              planName={view?.title ?? ''}
              createdAt={view?.created_at ?? ''}
              voice={voice}
            />
          )}
          {drawer === 'settings' && <SettingsDrawer link={link} voice={voice} />}
        </RoomDrawer>
      </div>

      <CallLayer
        inCall={voice.call.inCall}
        lkToken={voice.call.token}
        lkUrl={voice.call.url}
        agentStatus={voice.call.agentStatus}
        agentInCall={voice.call.agentInCall}
        onLeaveCall={voice.endCall}
        timerStr={voice.call.timer}
        teamMembers={voice.teamMembers}
        micMuted={voice.call.micMuted}
        onMicMuteChange={voice.call.setMicMuted}
        captionsOn={voice.call.captionsOn}
        onToggleCaptions={voice.call.toggleCaptions}
        onDispatchAgent={() => void voice.call.dispatchAgent()}
        onDetachAgent={() => void voice.call.detachAgent()}
        personaName={personaName(
          (link.session?.ai_config as Record<string, unknown> | undefined)?.['persona'] as string,
        )}
        personaSlug={
          ((link.session?.ai_config as Record<string, unknown> | undefined)?.[
            'persona'
          ] as string) ?? 'default'
        }
        isRecording={voice.recordings.isRecording}
        onAgentTranscript={voice.setAgentEntries}
      />

      <DrawerStrip open={drawer} onToggle={toggle} onTips={() => setTipsOpen(true)} />

      {chat.questionsOpen && (
        <QuestionsPanel
          sessionId={sessionId}
          busy={room.busy}
          onAsk={(number) => void chat.send(`edit ${number}`)}
          onClose={() => chat.setQuestionsOpen(false)}
        />
      )}

      <AllTipsSheet
        open={tipsOpen}
        onOpenChange={setTipsOpen}
        tips={tipsForAudience(tips, audience)}
        titles={Object.fromEntries(cards.map((c) => [c.key, c.title]))}
        colors={Object.fromEntries(cards.map((c) => [c.key, c.color]))}
        onNavigate={(route) => navigate(route)}
      />
    </div>
  );
}

export default function PlanRoomPage() {
  const { id = '' } = useParams<{ id: string }>();
  return (
    <div className="flex h-[calc(100vh-var(--titlebar-h))] w-screen flex-col overflow-hidden">
      <BackendGate>
        {/* Keyed so switching plans remounts with clean state. */}
        <RoomBody key={id} sessionId={id} />
      </BackendGate>
    </div>
  );
}
