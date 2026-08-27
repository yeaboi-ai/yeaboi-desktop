/**
 * Heuristic extractor for chat quick-reply chips.
 *
 * Reads the last assistant message and tries to surface 1–5 short reply
 * options the user can tap instead of typing. Conservative on purpose:
 * surfacing the wrong options ("Like", "what's broken" extracted from a
 * descriptive "broken or missing" phrase) is worse than surfacing none.
 */

const DISCOURSE_PREFIX_RE =
  /^(?:is it|it'?s|such as|well|so|hmm|oh|i mean|you know|right|ok|y[ae]+h|umm?)\s*[,!.]?\s+/i;
const LIKE_INTERJECTION_RE = /^like\s*[,!.]\s*/i;

function lastQuestionSentence(text: string): string | null {
  const lastQMark = text.lastIndexOf("?");
  if (lastQMark === -1) return null;
  let qStart = 0;
  for (let i = lastQMark - 1; i >= 0; i--) {
    if (text[i] === "." || text[i] === "!" || text[i] === "?") {
      if (i + 1 < text.length && /\s/.test(text[i + 1])) {
        qStart = i + 1;
        break;
      }
    }
  }
  return text.slice(qStart, lastQMark + 1).trim();
}

function isOptionShaped(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 2 || trimmed.length >= 40) return false;
  return trimmed.split(/\s+/).length <= 6;
}

export function extractQuickReplies(messageText: string): string[] {
  if (!messageText || !messageText.includes("?")) return [];

  // 1. Consecutive short questions: "X? Y? Z?"
  const consecutiveQs = messageText.match(/(?:[A-Z][A-Za-z0-9 /\-+.&'()]{2,40}\?\s*){2,}/g);
  if (consecutiveQs) {
    const best = consecutiveQs[consecutiveQs.length - 1];
    const options = best
      .split("?")
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 45);
    if (options.length >= 2) return options.slice(0, 5);
  }

  const lastQuestion = lastQuestionSentence(messageText);
  if (!lastQuestion) return [];

  // 2. "X, Y, or Z?" — comma-separated list with explicit "or" before last item.
  if (/,.*\bor\b/i.test(lastQuestion)) {
    // Cut a leading framing prefix at the first colon or em/en-dash. Without
    // this, "What matters most here — portfolio credibility, …, or X?" keeps
    // "What matters most here — portfolio credibility" as the first option,
    // which then trips the all-or-nothing length filter.
    const afterColon = lastQuestion.replace(/^[^:—–]*[:—–]\s*/, "");
    const cleaned = afterColon
      .replace(DISCOURSE_PREFIX_RE, "")
      .replace(LIKE_INTERJECTION_RE, "")
      .replace(/\?$/, "");

    // The tail after the LAST "or" must look like a short option, not a
    // long descriptive clause. "broken or missing right now that prompted
    // this idea" has "or" joining adjectives, not enumerating choices.
    const lastOrTail = cleaned.match(/\bor\s+([^?]+)$/i)?.[1]?.trim() ?? "";
    if (lastOrTail && isOptionShaped(lastOrTail)) {
      const parts = cleaned
        .split(/,\s*(?:or\s+)?|\s+or\s+/i)
        .map((s) => s.trim().replace(/^[(\[]+|[)\]]+$/g, ""));

      // All-or-nothing: if even one candidate fails the option-shape test,
      // the question wasn't really an enumeration — surfacing the survivors
      // would mislead the user into picking from a bad menu.
      if (parts.length >= 2 && parts.every(isOptionShaped)) {
        return parts.slice(0, 5);
      }
    }
  }

  // 3. "A or B?" — simple two-option (max 5 words each).
  const orMatch = lastQuestion.match(
    /([A-Za-z][A-Za-z0-9 /\-+.&'()]{1,30})\s+or\s+([A-Za-z][A-Za-z0-9 /\-+.&'()]{1,30})\?/i,
  );
  if (orMatch) {
    const a = orMatch[1].trim();
    const b = orMatch[2].trim();
    if (a.split(/\s+/).length <= 5 && b.split(/\s+/).length <= 5) {
      return [a, b];
    }
    return ["Yes", "No"];
  }

  // 4. Yes/no confirmation questions.
  const isYesNo =
    /does that (work|vibe|sound|look)/i.test(messageText) ||
    /sound (right|good|ok)/i.test(messageText) ||
    /work for you/i.test(messageText) ||
    /cool with/i.test(messageText) ||
    /(right|agree|good|ready|sure)\?$/i.test(messageText.trim());
  if (isYesNo) {
    return ["Yes, let's go", "No, let's change that"];
  }

  return [];
}
