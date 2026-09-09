export class PathStats {
    currentLossStreak = 0;

    grossLosses = 0;

    grossWins = 0;

    maxDrawdown = 0;

    maxLosingStreak = 0;

    peakBalance: number;

    tradesTaken = 0;

    constructor(startingBalance: number) {
        this.peakBalance = startingBalance;
    }

    recordTrade(isWon: boolean, pnl: number, balance: number): void {
        this.tradesTaken += 1;
        if (balance > this.peakBalance) this.peakBalance = balance;
        const dd = this.peakBalance - balance;
        if (dd > this.maxDrawdown) this.maxDrawdown = dd;
        if (isWon) {
            this.grossWins += pnl;
            this.currentLossStreak = 0;
        } else {
            this.grossLosses += -pnl;
            this.currentLossStreak += 1;
            if (this.currentLossStreak > this.maxLosingStreak) {
                this.maxLosingStreak = this.currentLossStreak;
            }
        }
    }

    rollUp(source: PathStats): void {
        this.tradesTaken += source.tradesTaken;
        this.grossWins += source.grossWins;
        this.grossLosses += source.grossLosses;
        if (source.maxLosingStreak > this.maxLosingStreak) {
            this.maxLosingStreak = source.maxLosingStreak;
        }
        if (source.maxDrawdown > this.maxDrawdown) {
            this.maxDrawdown = source.maxDrawdown;
        }
    }
}

export function newPathStats(startingBalance: number): PathStats {
    return new PathStats(startingBalance);
}
