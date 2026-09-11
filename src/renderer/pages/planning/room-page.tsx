'use client';

// The plan room: the conversation as a centred reading column, the stage
// strip over it, one composer under it, and a strip of drawers on the right
// edge. The call, its recap and the facilitator's voice settings hang off a
// vendored session row made the first time one of them is opened. Bare: no
// rail, no frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
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
import { stageStep } from '@/lib/planning/stages';
import { personaName } from '@/lib/planning/voice';
import { apiGet } from '@/lib/yeaboi/api';
import { allCards, loadCapabilities, type ModeCard } from '@/lib/yeaboi/capabilities';
import { stageLabel } from '@/lib/yeaboi/chat';
import { isTyping } from '@/lib/yeaboi/palette';
import { openShortcuts } from '@/lib/yeaboi/palette';
import { tipsForAudience, type Tip } from '@/lib/yeaboi/tips';

const HINTS: Record<string, string> = {
  intake: 'Answer, or / for commands',
  review: 'accept, or say what to change',
  epic: 'accept, or say what to change',
  chat: 'Ask anything about the plan',
};

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
  useEffect(() => {
    if (!chat.want) return;
    setPane('export');
    setDrawer('blueprint');
    chat.clearWant();
  }, [chat.want, chat]);

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

  const step = stageStep(room.stage, Boolean(room.question?.current_question));
  const hint = HINTS[room.stage] ?? 'Reply, or / for commands';

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <button
            type="button"
            onClick={() => navigate('/planning')}
            aria-label="Back to Planning"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <EditableTitle title={view?.title ?? ''} onSave={(next) => void chat.rename(next)} />
          <span className="text-[12px] text-muted-foreground">{stageLabel(room.stage)}</span>
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
            className="rounded-lg border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] text-success transition-colors hover:bg-success/20 disabled:opacity-40"
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

      <RoomDrawer kind={drawer} onClose={() => setDrawer(null)}>
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
    <div className="flex h-screen w-screen flex-col overflow-hidden pt-[var(--titlebar-h)]">
      <BackendGate>
        {/* Keyed so switching plans remounts with clean state. */}
        <RoomBody key={id} sessionId={id} />
      </BackendGate>
    </div>
  );
}
