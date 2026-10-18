const MONTHLY_NET_SCORE_MAX = 5;

export function bestExpectedMonthlyNet(
    rows: readonly { out: { expectedMonthlyNet: number } }[],
): number {
    let best = -Infinity;
    for (const row of rows) {
        if (row.out.expectedMonthlyNet > best)
            best = row.out.expectedMonthlyNet;
    }
    return best;
}

export function monthlyNetScoreText(score: number): string {
    return `${String(score)} of ${String(MONTHLY_NET_SCORE_MAX)}`;
}

export function scoreByExpectedMonthlyNet(
    monthlyNet: number,
    bestMonthlyNet: number,
): number {
    return bestMonthlyNet > 0
        ? Math.max(
              1,
              Math.round((monthlyNet / bestMonthlyNet) * MONTHLY_NET_SCORE_MAX),
          )
        : 1;
}
