'use client';

// The catalog beside the conversation, so a tracker or a doc platform can be
// connected without leaving the plan.

import { IntegrationsCatalog } from '@/components/yeaboi/integrations-catalog';

export function IntegrationsDrawer() {
  return <IntegrationsCatalog embedded />;
}
