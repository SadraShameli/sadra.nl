import { type Fraction0to1 } from './lib/units';

export enum ConsistencyBasis {
    Cycle = 'cycle',
    Perpetual = 'perpetual',
}

export enum ConsistencyScope {
    Both = 'both',
    Eval = 'eval',
    Funded = 'funded',
    None = 'none',
}

export class ConsistencyRule {
    constructor(
        readonly scope: ConsistencyScope,
        readonly maxBestDayShare: Fraction0to1,
        readonly basis: ConsistencyBasis = ConsistencyBasis.Cycle,
    ) {}

    appliesToEval(): boolean {
        return (
            this.scope === ConsistencyScope.Eval ||
            this.scope === ConsistencyScope.Both
        );
    }

    appliesToFunded(): boolean {
        return (
            this.scope === ConsistencyScope.Funded ||
            this.scope === ConsistencyScope.Both
        );
    }

    isPerpetual(): boolean {
        return this.basis === ConsistencyBasis.Perpetual;
    }

    isViolated(bestDayProfit: number, totalProfit: number): boolean {
        return (
            totalProfit > 0 &&
            bestDayProfit > 0 &&
            bestDayProfit / totalProfit > this.maxBestDayShare
        );
    }
}
