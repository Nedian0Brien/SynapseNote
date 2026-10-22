/**
 * Re-export shim — `ConfigSchema` and friends live in
 * `@nedian0brien/synapsenote-core`. Existing importers continue to work via this
 * shim during the gradual move; a follow-up updates them to import
 * from core directly and removes this file.
 *
 * Re-aliased rather than `export {} from '@inkeep/...'` so tsdown's dts
 * emit (rolldown-plugin-dts) can resolve the names — the plugin doesn't
 * trace bare re-exports across workspace package boundaries.
 */

import type { Config as CoreConfig } from '@nedian0brien/synapsenote-core';
import { ConfigSchema as CoreConfigSchema } from '@nedian0brien/synapsenote-core';

export type Config = CoreConfig;
export const ConfigSchema = CoreConfigSchema;
