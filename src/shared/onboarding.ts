// Whether the first-run onboarding wizard should gate the window. Pure — main
// feeds it the parsed ~/.yeaboi/.env, the persisted completion flag, and
// whether an identity predated this launch, so the decision is testable.
//
// The wizard shows only on a genuinely fresh machine:
//  - the flag records an explicit finish or skip (true), or that the wizard
//    is still owed (false — a fresh machine that quit mid-wizard), and an
//    explicit value always wins;
//  - a non-empty shared env is an existing TUI (or migrated) user — the same
//    test the TUI's own is_first_run() applies to the same file;
//  - a pre-existing identity is an existing desktop user from before the
//    wizard, who must not be ambushed by a required provider step.

export function needsOnboarding(
  sharedEnv: Record<string, string>,
  onboardingComplete: boolean | undefined,
  hadPriorIdentity: boolean,
): boolean {
  if (onboardingComplete !== undefined) return !onboardingComplete;
  if (Object.keys(sharedEnv).length > 0) return false;
  if (hadPriorIdentity) return false;
  return true;
}
