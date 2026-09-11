// The planning interview: what Niko asks on the way to a project.
//
// A script rather than a conversation. The bar's own turns are prose streamed
// from a model; these are a fixed set of questions with a fixed set of answers,
// because what they collect — a description, a name, a first ceremony — is
// exactly what `POST /api/projects` takes. A model asking for those three
// things in its own words each time would be a worse form of a form.
//
// Pure and free of React, so the flow is a table of cases rather than something
// only reachable by clicking through a chat.

/** What a turn puts under Niko's words. */
export type Bubble =
  | { kind: 'chips'; choices: Choice[] }
  | { kind: 'field'; label: string; value: string; confirm: string; retry?: string }
  | { kind: 'card'; title: string; detail: string; actions?: Choice[] }
  | { kind: 'working'; note: string };

export interface Choice {
  /** Sent back to {@link advance} when picked. */
  id: string;
  label: string;
  /** A quieter choice — "not now", "try another". */
  muted?: boolean;
}

/** Where the interview is, and what it has collected so far. */
export interface Interview {
  step: Step;
  /** What the team said they are building. */
  description: string;
  /** The name on offer, once there is one. */
  name: string;
  /** A project already in progress, offered as a way out of starting another. */
  carryOn?: { id: string; title: string };
  /** Set once the interview has nothing left to ask. */
  done?: { id: string } | 'dismissed';
}

export type Step = 'opening' | 'describing' | 'naming' | 'confirming' | 'creating' | 'closed';

/** One turn to put in the bar. */
export interface Turn {
  say: string;
  bubble?: Bubble;
}

/** What the host has to do before the next turn can be asked for. */
export type Effect =
  | { do: 'none' }
  | { do: 'name'; description: string }
  | { do: 'create'; description: string; name: string }
  | { do: 'open'; id: string }
  | { do: 'attach'; id: string }
  | { do: 'close' };

export function start(carryOn?: { id: string; title: string }): Interview {
  return { step: 'opening', description: '', name: '', ...(carryOn ? { carryOn } : {}) };
}

/** The turn to show for the state the interview is in. */
export function turnFor(state: Interview): Turn {
  switch (state.step) {
    case 'opening':
      return {
        say: 'What are we planning today?',
        bubble: {
          kind: 'chips',
          choices: [
            { id: 'new', label: 'Something new' },
            { id: 'roadmap', label: 'From a roadmap' },
            ...(state.carryOn
              ? [{ id: 'carry', label: `Carry on: ${state.carryOn.title}` } as Choice]
              : []),
            { id: 'dismiss', label: 'Not now', muted: true },
          ],
        },
      };
    case 'describing':
      return { say: 'Tell me what it is — a sentence is plenty.' };
    case 'naming':
      return { say: 'Reading that…', bubble: { kind: 'working', note: 'Finding it a name' } };
    case 'confirming':
      return {
        say: `Calling it **${state.name}**. Change it?`,
        bubble: {
          kind: 'field',
          label: 'Project name',
          value: state.name,
          confirm: 'Looks right',
          retry: 'Try another',
        },
      };
    case 'creating':
      return { say: 'Setting it up…', bubble: { kind: 'working', note: 'Creating the project' } };
    case 'closed':
      return state.done && state.done !== 'dismissed'
        ? {
            say: 'Done — it is on the page behind me.',
            bubble: {
              kind: 'card',
              title: state.name,
              detail: 'Plan · Analysis · Standup · Poker · Retro · Report',
              actions: [
                { id: 'open', label: 'Open it' },
                // Screenshots were only ever attachable while a project was
                // being made. They are attachable here instead.
                { id: 'attach', label: 'Add screenshots', muted: true },
              ],
            },
          }
        : { say: 'Right you are. I am down here if you want me.' };
  }
}

/**
 * The interview one answer on, and what the host has to do to get there.
 *
 * `answer` is a choice id for a chip or a card action, and the typed text
 * everywhere else. Nothing here talks to the backend — the effect says what
 * to ask for, and {@link resolve} takes the result.
 */
export function advance(state: Interview, answer: string): [Interview, Effect] {
  const said = answer.trim();
  switch (state.step) {
    case 'opening':
      if (said === 'dismiss')
        return [{ ...state, step: 'closed', done: 'dismissed' }, { do: 'close' }];
      if (said === 'carry' && state.carryOn) {
        return [
          { ...state, step: 'closed', done: { id: state.carryOn.id } },
          { do: 'open', id: state.carryOn.id },
        ];
      }
      if (said === 'roadmap') {
        return [
          { ...state, step: 'closed', done: 'dismissed' },
          { do: 'open', id: 'roadmap' },
        ];
      }
      return [{ ...state, step: 'describing' }, { do: 'none' }];
    case 'describing':
      if (!said) return [state, { do: 'none' }];
      return [
        { ...state, step: 'naming', description: said },
        { do: 'name', description: said },
      ];
    case 'confirming':
      if (said === 'retry') {
        return [
          { ...state, step: 'naming' },
          { do: 'name', description: state.description },
        ];
      }
      // A confirm carries the field's value, which may have been edited.
      return [
        { ...state, step: 'creating', name: said || state.name },
        { do: 'create', description: state.description, name: said || state.name },
      ];
    case 'closed':
      if (state.done && state.done !== 'dismissed') {
        if (said === 'open') return [state, { do: 'open', id: state.done.id }];
        if (said === 'attach') return [state, { do: 'attach', id: state.done.id }];
      }
      return [state, { do: 'none' }];
    // A turn that is waiting on the host takes no answers.
    case 'naming':
    case 'creating':
      return [state, { do: 'none' }];
  }
}

/** The interview with the host's answer folded in. */
export function resolve(
  state: Interview,
  result: { name: string } | { created: { id: string } } | { failed: string },
): Interview {
  if ('name' in result) return { ...state, step: 'confirming', name: result.name };
  if ('created' in result) return { ...state, step: 'closed', done: result.created };
  // A failure is not the end of the interview: the step that asked comes back
  // so the answer can be given again.
  return { ...state, step: state.step === 'creating' ? 'confirming' : 'describing' };
}

/** True while the composer should be typing into the interview rather than
 *  sending a question to the model. */
export function takesTyping(state: Interview): boolean {
  return state.step === 'describing';
}

/** True while the interview is still asking for something. */
export function running(state: Interview): boolean {
  return state.step !== 'closed';
}
