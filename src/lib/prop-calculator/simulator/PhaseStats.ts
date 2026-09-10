export class DrawdownTracker {
    private peak: number;

    constructor(
        startingBalance: number,
        private readonly totals: TradeTotals,
    ) {
        this.peak = startingBalance;
    }

    recordBalance(balance: number): void {
        if (balance > this.peak) this.peak = balance;
        this.totals.advanceMaxDrawdown(this.peak - balance);
    }
}

export class LossStreak {
    private current = 0;

    constructor(private readonly totals: TradeTotals) {}

    recordLoss(): void {
        this.current += 1;
        this.totals.advanceMaxLosingStreak(this.current);
    }

    recordWin(): void {
        this.current = 0;
    }
}

export class PhaseStats {
    private tradesInPhase = 0;

    constructor(
        readonly totals: TradeTotals,
        readonly streak: LossStreak,
        private readonly drawdown: DrawdownTracker,
    ) {}

    get tradesTaken(): number {
        return this.tradesInPhase;
    }

    recordTrade(isWon: boolean, pnl: number, balance: number): void {
        this.tradesInPhase += 1;
        if (isWon) {
            this.totals.recordWin(pnl);
            this.streak.recordWin();
        } else {
            this.totals.recordLoss(pnl);
            this.streak.recordLoss();
        }
        this.drawdown.recordBalance(balance);
    }
}

export class TradeTotals {
    private grossLossesValue = 0;

    private grossWinsValue = 0;

    private maxDrawdownValue = 0;

    private maxLosingStreakValue = 0;

    private tradesTakenValue = 0;

    get grossLosses(): number {
        return this.grossLossesValue;
    }

    get grossWins(): number {
        return this.grossWinsValue;
    }

    get maxDrawdown(): number {
        return this.maxDrawdownValue;
    }

    get maxLosingStreak(): number {
        return this.maxLosingStreakValue;
    }

    get tradesTaken(): number {
        return this.tradesTakenValue;
    }

    advanceMaxDrawdown(candidate: number): void {
        if (candidate > this.maxDrawdownValue) {
            this.maxDrawdownValue = candidate;
        }
    }

    advanceMaxLosingStreak(candidate: number): void {
        if (candidate > this.maxLosingStreakValue) {
            this.maxLosingStreakValue = candidate;
        }
    }

    recordLoss(pnl: number): void {
        this.tradesTakenValue += 1;
        this.grossLossesValue += -pnl;
    }

    recordWin(pnl: number): void {
        this.tradesTakenValue += 1;
        this.grossWinsValue += pnl;
    }
}

export function newPhaseStats(
    startingBalance: number,
    totals: TradeTotals,
    streak: LossStreak,
): PhaseStats {
    return new PhaseStats(
        totals,
        streak,
        new DrawdownTracker(startingBalance, totals),
    );
}
