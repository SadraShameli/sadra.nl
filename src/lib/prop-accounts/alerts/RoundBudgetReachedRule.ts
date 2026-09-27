import { CentsDisplay, formatUsdCents, RoundStatus, usdCents } from '../core';
import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, type AlertRoundRow } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class RoundBudgetReachedRule extends AlertRule {
    readonly kind = AlertKind.RoundBudgetReached;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return context.rounds.flatMap((round) => {
            if (!hasReachedBudget(round)) return [];
            return [
                {
                    disclosures: [],
                    kind: this.kind,
                    message: `Round "${round.label}" has spent ${formatUsdCents(usdCents(round.budget.spentCents), CentsDisplay.Always)} of its ${formatUsdCents(usdCents(round.budget.budgetCents ?? 0), CentsDisplay.Always)} budget`,
                    severity: AlertSeverity.Info,
                    subject: { accountIds: [], kind: AlertSubjectKind.Portfolio },
                },
            ];
        });
    }
}

function hasReachedBudget(round: AlertRoundRow): boolean {
    return (
        round.status === RoundStatus.Open &&
        round.budget.budgetCents !== null &&
        round.budget.spentCents >= round.budget.budgetCents
    );
}
