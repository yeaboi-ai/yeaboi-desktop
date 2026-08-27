// The one import path for duck branding. App code pulls Duck/Wordmark from
// here rather than deep-importing @design paths everywhere.

export { Duck, useDuckPulse } from '@design/primitives/Duck';
export type { DuckPulse, DuckRest, DuckState } from '@design/primitives/Duck';
export { Wordmark } from '@design/primitives/Wordmark';
