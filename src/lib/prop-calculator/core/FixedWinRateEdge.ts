import { EdgeModel } from './EdgeModel';
import { type Fraction0to1 } from './lib/units';

export class FixedWinRateEdge extends EdgeModel {
    constructor(readonly winrate: Fraction0to1) {
        super();
    }

    winProbability(_rrRatio: number): Fraction0to1 {
        return this.winrate;
    }
}
