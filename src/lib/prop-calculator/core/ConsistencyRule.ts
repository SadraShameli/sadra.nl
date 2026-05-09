export type ConsistencyScope = 'eval' | 'funded' | 'both' | 'none';

export class ConsistencyRule {
    constructor(
        readonly scope: ConsistencyScope,
        readonly maxBestDayShare: number,
    ) {}

    appliesToEval(): boolean {
        return this.scope === 'eval' || this.scope === 'both';
    }

    appliesToFunded(): boolean {
        return this.scope === 'funded' || this.scope === 'both';
    }

    isViolated(bestDayProfit: number, totalProfit: number): boolean {
        if (totalProfit <= 0 || bestDayProfit <= 0) return false;
        return bestDayProfit / totalProfit > this.maxBestDayShare;
    }
}
