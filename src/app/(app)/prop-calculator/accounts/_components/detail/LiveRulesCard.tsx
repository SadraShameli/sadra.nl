import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';

import { LiveRulesCardKind, type LiveRulesCardView } from './detailState';

export function LiveRulesCard({ view }: { readonly view: LiveRulesCardView }) {
    switch (view.kind) {
        case LiveRulesCardKind.Modeled: {
            const rows: readonly (readonly [string, string])[] = [
                [
                    'Drawdown',
                    view.drawdown === null
                        ? NOT_APPLICABLE
                        : `${formatCurrency(view.drawdown.amount)} ${view.drawdown.kind}`,
                ],
                [
                    'Daily loss limit',
                    view.dailyLossLimit === null
                        ? NOT_APPLICABLE
                        : formatCurrency(view.dailyLossLimit),
                ],
                ['Cushion percent', formatPercent(view.cushionPercent, 0)],
                [
                    'Requires lock for withdrawal',
                    view.requiresLockForWithdrawal ? 'yes' : 'no',
                ],
                [
                    'Minimum payout request',
                    formatCurrency(view.minPayoutRequest),
                ],
            ];
            return (
                <div className="flex flex-col gap-4">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                        {rows.map(([term, value]) => (
                            <div className="contents" key={term}>
                                <dt className="text-muted-foreground">
                                    {term}
                                </dt>
                                <dd className="tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    {view.isApproximation && (
                        <p className="text-sm text-muted-foreground">
                            Only a firm-level live model exists for this plan,
                            so these rules are an approximation.
                        </p>
                    )}
                </div>
            );
        }
        case LiveRulesCardKind.NotModeled: {
            return (
                <p className="text-sm text-muted-foreground">
                    No live stage is modeled for this plan.
                </p>
            );
        }
        case LiveRulesCardKind.Pending: {
            return (
                <p className="text-sm text-muted-foreground">
                    Enter a live balance snapshot to see the applicable live
                    rules.
                </p>
            );
        }
    }
}
