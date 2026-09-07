// Types for the bump script, so the test can import it under strict TypeScript.
export const LEVELS: readonly string[];
export const FLOOR_MAJOR: number;
export function bump(version: string, level: string): string;
export function readVersion(root: string): string;
export function writeVersion(root: string, next: string): void;
