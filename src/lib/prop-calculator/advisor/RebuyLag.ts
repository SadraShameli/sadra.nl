import { type MeasuredRebuyLag } from './EnginePolicyBuilder';
import { RebuyLagBasis } from './policy';

export interface RebuyLagResolution {
    readonly basis: RebuyLagBasis;
    readonly days: number;
}

export function measuredRebuyLagFrom(
    resolution: RebuyLagResolution,
): MeasuredRebuyLag {
    return {
        days: resolution.days,
        samples: resolution.basis === RebuyLagBasis.Measured ? 1 : 0,
    };
}
