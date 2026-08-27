'use client';

import { useEffect, useRef, useState } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '🙃',
      '😉',
      '😊',
      '😇',
      '🥰',
      '😍',
      '🤩',
      '😘',
      '😗',
      '😚',
      '😙',
      '😋',
      '😛',
      '😜',
      '🤪',
      '🤨',
      '🧐',
      '🤓',
      '😎',
      '🥸',
      '😏',
      '😒',
      '😞',
      '😔',
      '😟',
      '😕',
      '🙁',
      '😣',
      '😖',
      '😫',
      '😩',
      '🥺',
      '😢',
      '😭',
      '😤',
      '😠',
      '😡',
      '🤬',
      '🤯',
    ],
  },
  {
    label: 'Reactions',
    emojis: [
      '👍',
      '👎',
      '👏',
      '🙌',
      '🙏',
      '💪',
      '🤝',
      '👀',
      '🔥',
      '✨',
      '💯',
      '🎉',
      '🎊',
      '🏆',
      '⭐',
      '💖',
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🤍',
      '🖤',
      '💔',
      '💢',
      '💥',
      '💫',
      '💬',
      '👋',
      '🫡',
      '🤔',
    ],
  },
  {
    label: 'Objects & Symbols',
    emojis: [
      '💡',
      '📌',
      '📎',
      '🔗',
      '📝',
      '📄',
      '📊',
      '📈',
      '✅',
      '❌',
      '⚠️',
      '🚀',
      '🛠️',
      '🐛',
      '💻',
      '📱',
      '☕',
      '🍕',
      '🍔',
      '🍿',
      '🎯',
      '🧠',
      '👨‍💻',
      '👩‍💻',
    ],
  },
];

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '🤔'];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  /** Show only the quick-reactions strip (used for picking a reaction). */
  compact?: boolean;
}

export function EmojiPicker({
  onPick,
  onClose,
  align = 'left',
  compact = false,
}: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  if (compact) {
    return (
      <div
        ref={ref}
        className={`absolute bottom-full mb-1 ${align === 'right' ? 'right-0' : 'left-0'} flex items-center gap-1 px-1.5 py-1 rounded-full bg-secondary border border-border shadow-2xl z-50`}
      >
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              onPick(e);
              onClose();
            }}
            className="w-7 h-7 rounded-full hover:bg-foreground/[0.10] flex items-center justify-center text-base transition-colors"
            title={`React with ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    );
  }

  const filteredGroups = filter
    ? EMOJI_GROUPS.map((g) => ({
        ...g,
        emojis: g.emojis.filter((e) => e.includes(filter)),
      })).filter((g) => g.emojis.length)
    : EMOJI_GROUPS;

  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-2 ${align === 'right' ? 'right-0' : 'left-0'} w-[280px] max-h-[320px] flex flex-col bg-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden`}
    >
      <div className="px-2 py-1.5 border-b border-border/60">
        <input
          autoFocus
          type="text"
          placeholder="Search…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-foreground/[0.06] border border-border/60 rounded-md px-2 py-1 text-[12px] text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none focus:border-border"
        />
      </div>
      <div className="overflow-y-auto p-1.5 space-y-2">
        {filteredGroups.map((g) => (
          <div key={g.label}>
            <div className="px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/50 font-medium">
              {g.label}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onPick(e);
                    onClose();
                  }}
                  className="w-7 h-7 rounded-md hover:bg-foreground/[0.10] flex items-center justify-center text-base transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
