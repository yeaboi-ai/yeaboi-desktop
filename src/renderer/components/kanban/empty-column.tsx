'use client';

import { Inbox } from 'lucide-react';

interface Props {
  columnName: string;
  filtered: boolean;
}

const HINTS: Record<string, string> = {
  Backlog: 'Drop a card here, or press c to create one.',
  'To Do': "Pick a card from the backlog when you're ready to start.",
  'In Progress': 'Drag a card here when work begins.',
  Review: "Drag a card here when it's ready for review.",
  Done: 'Nothing done yet — go ship something.',
};

export function EmptyColumn({ columnName, filtered }: Props) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-xs text-muted-foreground/70 border border-dashed border-border rounded-md">
        <Inbox className="h-5 w-5 mb-2 opacity-50" />
        No cards match the current filters.
      </div>
    );
  }
  const hint = HINTS[columnName] ?? 'Drag a card here.';
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-xs text-muted-foreground/70 border border-dashed border-border rounded-md">
      <Inbox className="h-5 w-5 mb-2 opacity-50" />
      {hint}
    </div>
  );
}
