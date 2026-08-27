'use client';

// The renderer's half of the ambient feed, mounted once in Providers.
//
// Main reads the single SSE stream and pushes every event here; this host
// turns them into the app's own furniture: consent requests open the sandbox
// modal, awareness notices speak through the duck (sticky ones hold the
// bubble until answered) and the ceremony/ship kinds also land as toasts so
// they survive the bubble's fade. When the backend comes up, the quip table
// rides in with the ambience preferences so both surfaces keep one tone.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { onAmbientEvent, onNavigate } from '@/lib/yeaboi/api';
import { getAmbience, loadQuips } from '@/lib/yeaboi/ambience';
import { duckVoice } from '@/lib/duck-voice';
import { notifyPrefs, setNotifyPrefs } from '@/lib/duck-events';
import { PET_DEFAULTS, mergePetPrefs } from '@shared/pet-prefs';
import { toast } from '@/components/ui/toast';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { ConsentModal } from './consent-modal';

/** Notice kinds worth a toast as well as a quip — things that happened while
 *  nobody was looking and should outlive the bubble. */
const TOASTED_KINDS = new Set(['ceremony_ran', 'ceremony_failed', 'ship_gate']);

export function AmbienceHost() {
  const backend = useYeaboiBackend();
  const navigate = useNavigate();
  const [consentSignal, setConsentSignal] = useState(0);

  useEffect(() => {
    // The duck's notification choices, read once. duck-events keeps them: it is
    // where every notice is turned into words, here and on every page.
    window.yeaboi
      .getPetPrefs()
      .then((stored) => setNotifyPrefs(mergePetPrefs(PET_DEFAULTS, stored)))
      .catch(() => undefined);
    onNavigate((route) => {
      // Main asking the window to show a route — the tray, or a click on the
      // desktop duck holding a question.
      navigate(route.startsWith('/') ? route : `/${route}`);
    });
    onAmbientEvent((event) => {
      if (event.type === 'consent_request') {
        setConsentSignal((signal) => signal + 1);
        return;
      }
      if (event.type !== 'notice') return;
      const quip = String(event['quip'] ?? '');
      const route = String(event['route'] ?? '');
      const kind = String(event['kind'] ?? '');
      // The same rule the pet follows: a question holds the bubble until it
      // is answered, everything else fades.
      if (event['sticky']) duckVoice().saySticky(quip);
      else duckVoice().say(quip);
      if (TOASTED_KINDS.has(kind) && quip && notifyPrefs().notify.toast) {
        const failed = kind === 'ceremony_failed';
        toast.show({
          title: quip,
          variant: failed ? 'destructive' : 'default',
          ...(route ? { action: { label: 'Open', onClick: () => navigate(route) } } : {}),
        });
      }
    });
    // Subscriptions live for the window's life — the bridge has no teardown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (backend.kind !== 'ready') return;
    getAmbience().then(
      (state) => loadQuips(state.duck.quips),
      () => undefined,
    );
  }, [backend.kind]);

  return <ConsentModal signal={consentSignal} />;
}
