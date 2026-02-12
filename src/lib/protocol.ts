/**
 * Re-export the protocol interface and types.
 * The actual implementations are in hyperion-classic.ts and hyperion-ng.ts.
 */
export type { HyperionProtocol } from '../types/hyperion';
export { HyperionClassic } from './hyperion-classic';
export { HyperionNg } from './hyperion-ng';
