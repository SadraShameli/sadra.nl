import { type Fraction0to1 } from './lib/units';

export function resolveLiveTradeRisk(
    cushion: number,
    cushionPercent: Fraction0to1,
): number {
    return cushion <= 0 ? 0 : cushionPercent * cushion;
}
