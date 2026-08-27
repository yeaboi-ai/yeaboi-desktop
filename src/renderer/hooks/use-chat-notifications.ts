'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from 'react';
import { playChime, windowFocused } from '@/lib/chime';

const STORAGE_KEY = 'chat_notifications_enabled';

interface NotifiableMessage {
  id: string;
  content: string;
  message_type: 'chat' | 'ai' | 'system' | 'voice_chat' | 'voice_ai';
  user_id: string | null;
  user_name?: string;
  speaker_name?: string | null;
}

interface UseChatNotificationsArgs {
  messages: NotifiableMessage[];
  currentUserId?: string | null;
}

function readEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(STORAGE_KEY);
  // default-on; explicitly "false" disables.
  return v !== 'false';
}

function writeEnabled(v: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
}

/**
 * Browser notifications + sound + tab-title unread badge for incoming chat
 * messages. Skips notifying when the window is focused or when disabled.
 */
export function useChatNotifications({ messages, currentUserId }: UseChatNotificationsArgs) {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabled());
  const [unread, setUnread] = useState<number>(0);
  const lastSeenIdRef = useRef<string | null>(null);
  const originalTitleRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // Capture the original tab title once so we can restore / decorate it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
  }, []);

  // Reflect unread count in the document title.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = originalTitleRef.current ?? document.title;
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  // Watch the messages array for new entries and notify when appropriate.
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    // Initial mount: skip notifying for whatever already loaded.
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenIdRef.current = last.id;
      return;
    }
    if (last.id === lastSeenIdRef.current) return;
    lastSeenIdRef.current = last.id;

    // Don't notify on system messages or on our own outgoing chats.
    if (last.message_type === 'system') return;
    if (last.user_id && currentUserId && last.user_id === currentUserId) return;
    // Optimistic local echoes use "self" as the user_id placeholder.
    if (last.user_id === 'self') return;

    // Always bump the unread badge — Slack/WhatsApp-style. The user clears it
    // by interacting with the chat (markAllRead), not by switching tabs.
    setUnread((n) => n + 1);

    if (!enabled) return;

    // Always chime on a new other-user message when notifications are on.
    // The bell toggle is the user's "quiet please" affordance; we don't
    // suppress on focus because the user wants the audible confirmation
    // even while watching the chat (and won't hear it twice — one chime
    // per message).
    playChime();

    // Only show the OS-level browser notification when the tab is in the
    // background — otherwise it's redundant with the in-app badge + chime
    // and most browsers suppress it anyway when the page is focused.
    if (
      !windowFocused() &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const title = last.speaker_name || last.user_name || 'New message';
        const body = (last.content || '').slice(0, 140);
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'session-chat',
          silent: true, // we already play our own chime
        });
      } catch {
        /* permission/rendering issues — non-fatal */
      }
    }
  }, [messages, enabled, currentUserId]);

  const toggleEnabled = useCallback(() => {
    setEnabled((cur) => {
      const next = !cur;
      writeEnabled(next);
      // Lazy permission ask the moment the user opts in.
      if (
        next &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission().catch(() => {});
      }
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setUnread(0);
  }, []);

  return { enabled, toggleEnabled, unread, markAllRead };
}
