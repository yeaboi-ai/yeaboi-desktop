// The pure half of the OS path picker: what the renderer asked for, and the
// Electron dialog properties that ask it. The Electron call itself stays in
// the main process — see src/main/index.ts.
//
// There is deliberately no 'any' kind that offers files and folders in one
// dialog: macOS honours both, Windows and Linux silently honour one. Callers
// that want both offer two buttons.

export type PickKind = 'file' | 'folder';

export interface PickOptions {
  title?: string;
  defaultPath?: string;
  kind: PickKind;
  multi: boolean;
  filters: { name: string; extensions: string[] }[];
}

/** At most this many file-type filters survive; a renderer cannot flood the dialog. */
const MAX_FILTERS = 8;

function asFilters(raw: unknown): PickOptions['filters'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (f): f is { name: string; extensions: string[] } =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as { name?: unknown }).name === 'string' &&
        Array.isArray((f as { extensions?: unknown }).extensions),
    )
    .slice(0, MAX_FILTERS)
    .map((f) => ({
      name: f.name,
      extensions: f.extensions.filter((e): e is string => typeof e === 'string'),
    }));
}

/**
 * Coerce whatever crossed the IPC boundary into options the dialog can take.
 *
 * Anything unrecognised becomes the safe default — a single folder — rather
 * than reaching Electron as a shape it will throw on.
 */
export function clampPickOptions(raw: unknown): PickOptions {
  const input = (raw ?? {}) as Record<string, unknown>;
  return {
    title: typeof input.title === 'string' ? input.title : undefined,
    defaultPath: typeof input.defaultPath === 'string' ? input.defaultPath : undefined,
    kind: input.kind === 'file' ? 'file' : 'folder',
    multi: input.multi === true,
    filters: asFilters(input.filters),
  };
}

/** The `properties` array for one pick. */
export function pickProperties(kind: PickKind, multi: boolean): string[] {
  const base = kind === 'file' ? ['openFile'] : ['openDirectory', 'createDirectory'];
  return multi ? [...base, 'multiSelections'] : base;
}
