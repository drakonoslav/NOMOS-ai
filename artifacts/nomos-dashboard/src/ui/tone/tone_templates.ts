/**
 * tone_templates.ts
 *
 * Compatibility shim — the implementation has moved to tone_resolver.ts.
 * This file exists only to avoid breaking any remaining import paths.
 */

export type { ToneMessage } from "./tone_types";
export { resolveToneMessage as buildToneMessage } from "./tone_resolver";
