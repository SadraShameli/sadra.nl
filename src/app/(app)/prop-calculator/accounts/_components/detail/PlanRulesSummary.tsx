import { describeConsistencyBadge } from '~/app/(app)/prop-calculator/_components/consistencyBadge';
import { dailyLossLimitLabel } from '~/app/(app)/prop-calculator/_components/dailyLossLimitLabel';
import PlanStatsBadges from '~/app/(app)/prop-calculator/_components/PlanStatsBadges';
import { formatCurrency } from '~/lib/format';
import {
    describePlanOptIn,
    offeredPlanOptIns,
    planOptInField,
} from '~/lib/prop-accounts';
import { type Plan, type PlanOptIns } from '~/lib/prop-calculator';

const NO_LIMIT = 'None';

type SummaryRow = readonly [string, string];

export function PlanRulesSummary({
    firmName,
    optIns,
    plan,
}: {
    readonly firmName: string;
    readonly optIns: PlanOptIns;
    readonly plan: Plan;
}) {
    const takenOptIns = offeredPlanOptIns(plan).filter(
        (optIn) => optIns[planOptInField(optIn)],
    );
    const evaluationRows: readonly SummaryRow[] = plan.isInstantFunded
        ? []
        : [
              ['Profit target', formatCurrency(plan.profitTarget)],
              ['Evaluation drawdown', formatCurrency(plan.drawdown.amount)],
              [
                  'Evaluation daily loss limit',
                  dailyLossLimitLabel(plan.evalDailyLossLimit) ?? NO_LIMIT,
              ],
              ['Minimum evaluation trading days', String(plan.minTradingDays)],
          ];
    const rows: readonly SummaryRow[] = [
        ['Plan', `${firmName} ${plan.label}`],
        ['Account size', formatCurrency(plan.accountSize)],
        ...evaluationRows,
        ['Funded drawdown', formatCurrency(plan.fundedDrawdown.amount)],
        [
            'Funded daily loss limit',
            dailyLossLimitLabel(plan.fundedDailyLossLimit) ?? NO_LIMIT,
        ],
        ['Consistency', describeConsistencyBadge(plan) ?? NO_LIMIT],
        [
            'Rule options taken',
            takenOptIns.length === 0
                ? NO_LIMIT
                : takenOptIns
                      .map((optIn) => describePlanOptIn(optIn))
                      .join(', '),
        ],
    ];
    return (
        <div className="flex flex-col gap-4">
            <PlanStatsBadges plan={plan} />
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                {rows.map(([term, value]) => (
                    <div className="contents" key={term}>
                        <dt className="text-muted-foreground">{term}</dt>
                        <dd className="tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
