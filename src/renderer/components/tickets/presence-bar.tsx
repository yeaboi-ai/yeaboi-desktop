"use client";

import type { PresenceUser } from "@/hooks/use-card-presence";

interface Props {
  viewers: PresenceUser[];
  /** Optional id of the local user — they'll be excluded from the stack. */
  selfId?: string | null;
  max?: number;
}

// Compact overlapping avatar stack. Falls back to initials when no image is set,
// which is the common case during dev and for users without avatars.
export function PresenceBar({ viewers, selfId, max = 5 }: Props) {
  const others = viewers.filter((v) => (selfId ? v.id !== selfId : true));
  if (others.length === 0) return null;

  const visible = others.slice(0, max);
  const overflow = others.length - visible.length;

  return (
    <div
      className="flex items-center -space-x-2"
      role="group"
      aria-label={`${others.length} other viewer${others.length === 1 ? "" : "s"}`}
    >
      {visible.map((v) => (
        <Avatar key={v.id} user={v} />
      ))}
      {overflow > 0 && (
        <div
          className="relative w-6 h-6 rounded-full bg-muted text-[10px] font-medium text-muted-foreground border border-background flex items-center justify-center"
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

function Avatar({ user }: { user: PresenceUser }) {
  const label = user.name ?? user.email ?? user.id;
  const initial = (label ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      className="relative w-6 h-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center border border-background overflow-hidden"
      title={label ?? undefined}
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt={label ?? ""} className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
