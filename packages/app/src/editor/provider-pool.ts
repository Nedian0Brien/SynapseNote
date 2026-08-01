import { ProviderPoolEviction } from './provider-pool-eviction';

export type { ServerRestartRecoveryState, SyncState } from './provider-pool-contracts';
export { MAX_POOL } from './provider-pool-contracts';
export { TAB_REPLAY_ORIGIN } from './provider-pool-replay';

/** Public orchestration facade for the named provider-pool capabilities. */
export class ProviderPool extends ProviderPoolEviction {}
