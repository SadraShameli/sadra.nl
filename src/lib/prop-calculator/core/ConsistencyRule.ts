import { type Fraction0to1 } from './lib/units';

export enum ConsistencyBasis {
    Cycle = 'cycle',
    Perpetual = 'perpetual',
}

export enum ConsistencyBoundary {
    Exclusive = 'exclusive',
    Inclusive = 'inclusive',
}

export enum ConsistencyNonPositiveProfit {
    Passes = 'passes',
    Violates = 'violates',
}

export enum ConsistencyScope {
    Both = 'both',
    Eval = 'eval',
    Funded = 'funded',
    None = 'none',
}

export enum ConsistencyViolationEffect {
    DoubleTarget = 'double-target',
    Fail = 'fail',
}

export class ConsistencyRule {
    static formatShare(share: number): string {
        return `${Math.round(share * 10_000) / 100}%`;
    }

    constructor(
        readonly scope: ConsistencyScope,
        readonly maxBestDayShare: Fraction0to1,
        readonly basis: ConsistencyBasis = ConsistencyBasis.Cycle,
        readonly violationEffect: ConsistencyViolationEffect = ConsistencyViolationEffect.Fail,
        readonly boundary: ConsistencyBoundary = ConsistencyBoundary.Exclusive,
        readonly nonPositiveProfit: ConsistencyNonPositiveProfit = ConsistencyNonPositiveProfit.Passes,
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

    shareLabel(): string {
        const qualifiers = [
            ...(this.boundary === ConsistencyBoundary.Inclusive
                ? ['inclusive']
                : []),
            ...(this.nonPositiveProfit === ConsistencyNonPositiveProfit.Violates
                ? ['fails on a net-losing cycle']
                : []),
        ];
        const share = ConsistencyRule.formatShare(this.maxBestDayShare);
        return qualifiers.length === 0
            ? share
            : `${share} (${qualifiers.join(', ')})`;
    }

    isViolated(bestDayProfit: number, totalProfit: number): boolean {
        if (totalProfit <= 0) {
            return (
                this.nonPositiveProfit === ConsistencyNonPositiveProfit.Violates
            );
        }
        if (bestDayProfit <= 0) return false;
        const bestDayShare = bestDayProfit / totalProfit;
        switch (this.boundary) {
            case ConsistencyBoundary.Exclusive: {
                return bestDayShare > this.maxBestDayShare;
            }
            case ConsistencyBoundary.Inclusive: {
                return bestDayShare >= this.maxBestDayShare;
            }
        }
    }
}
