import { type DayProgress } from '~/lib/prop-calculator/advisor/RuleContext';
import { type SizingAdvisor } from '~/lib/prop-calculator/advisor/SizingAdvisor';
import { dollars } from '~/lib/prop-calculator/core';

export function dayProgressFromCounts(
    advisor: SizingAdvisor,
    wins: number,
    losses: number,
): DayProgress {
    const rungs = advisor.dailyPlanCard()?.rungs ?? [];
    const lastIndex = rungs.length - 1;
    const runningLoss =
        losses <= 0 || lastIndex < 0
            ? dollars(0)
            : (rungs[Math.min(losses - 1, lastIndex)]?.runningLossAfter ??
              dollars(0));
    const currentRung =
        lastIndex < 0 ? null : (rungs[Math.min(losses, lastIndex)] ?? null);
    const winProfit = currentRung === null ? 0 : wins * currentRung.takeProfit;
    return {
        dayPnL: dollars(winProfit - runningLoss),
        losses,
        runningLoss,
        wins,
    };
}
