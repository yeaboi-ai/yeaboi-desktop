// The words a provider failure is shown in, in one place, because more than
// one surface says them: the health banner and the Settings → Credentials row.
//
// The backend's own `message` is a diagnostic, not copy — it has carried
// "Provider anthropic circuit open (consecutive_failures=2); failing fast to
// prevent retry amplification" all the way to the banner — so it stays in the
// log and every surface reads its wording from here instead.

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  google: 'Google',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  deepgram: 'Deepgram',
  elevenlabs: 'ElevenLabs',
  cartesia: 'Cartesia',
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function providerLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? titleCase(name);
}

/** The banner's sentence: what happened, and what the user can do about it. */
export function providerFailureDetail(
  code: string | null | undefined,
  provider: string,
  byok = false,
): string {
  const name = providerLabel(provider);
  const yours = byok ? 'your ' : 'the ';
  switch (code) {
    case 'PROVIDER_INVALID_KEY':
      return `${name} rejected ${yours}API key. Check it in Settings → Credentials — an unreplaced placeholder and a revoked key both look like this.`;
    case 'PROVIDER_CREDIT_EXHAUSTED':
      return `${name} reports no credit left on ${yours}account. Top it up, or switch provider in Settings → Credentials.`;
    case 'PROVIDER_RATE_LIMITED':
      return `${name} is rate-limiting requests. This usually clears on its own in a minute or two.`;
    default:
      return `${name} is not responding. This usually clears on its own; if it persists, check Settings → Credentials.`;
  }
}

/** The settings row's two words. `is_set` only says a value was typed in — a
 *  placeholder key is "set" and still fails, so health overrides it. */
export function providerFailureLabel(code: string | null | undefined): string {
  switch (code) {
    case 'PROVIDER_INVALID_KEY':
      return 'key rejected';
    case 'PROVIDER_CREDIT_EXHAUSTED':
      return 'out of credits';
    case 'PROVIDER_RATE_LIMITED':
      return 'rate limited';
    default:
      return 'not responding';
  }
}
