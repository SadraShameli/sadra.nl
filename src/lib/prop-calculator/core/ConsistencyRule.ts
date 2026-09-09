import { type Fraction0to1 } from './units';

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

    isViolated(bestDayProfit: number, totalProfit: number): boolean {
        if (totalProfit <= 0 || bestDayProfit <= 0) return false;
        return bestDayProfit / totalProfit > this.maxBestDayShare;
    }
}
