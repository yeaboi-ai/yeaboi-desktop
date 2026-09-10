// Where a Credentials-managed connection is configured.
//
// Credentials hides what is not set up, so the Catalog cannot simply link the
// page and hope: it names the card, and the tab reveals it. One mechanism,
// three callers — the connector sheet, the export destinations card, and the
// System tab's voice pair.

/** The settings URL that opens `row` ready to be set up. */
export function credentialsHref(row: { key: string; section: string }): string {
  // ElevenLabs and Tavus both live in section 'voice' on the System tab, so
  // only the key tells them apart.
  return row.section === 'voice'
    ? `/settings/system?add=${row.key}`
    : `/settings/credentials?add=${row.section}`;
}
