'use client';

import { use } from 'react';
import { TicketWorkspace } from '@/components/tickets/ticket-workspace';

// Standalone ticket route. Accepts a friendly id (PROJ-123) or a card uuid; the
// backend resolver at /api/tickets/{id_or_key} handles either. Same workspace
// component used by the side panel in Phase 3.
export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketWorkspace idOrKey={id} mode="page" />;
}
