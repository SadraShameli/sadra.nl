import { type Fraction0to1 } from './lib/units';

export abstract class EdgeModel {
    abstract winProbability(rrRatio: number): Fraction0to1;
}
