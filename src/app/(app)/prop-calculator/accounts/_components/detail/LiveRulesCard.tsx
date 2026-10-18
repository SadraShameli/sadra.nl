import { Radar } from 'lucide-react';
import { type ReactNode } from 'react';

import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { DetailList, type DetailListItem } from '~/components/DetailList';
import { MissingValue } from '~/components/MissingValue';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCurrency, formatPercent } from '~/lib/format';
import { type LiveContractCaps } from '~/lib/prop-calculator';
import { DRAWDOWN_KIND_TEXT } from '~/lib/prop-calculator/describe';

import { LiveRulesCardKind, type LiveRulesCardView } from './detailState';

export function LiveRulesCard({ view }: { readonly view: LiveRulesCardView }) {
    switch (view.kind) {
        case LiveRulesCardKind.Modeled: {
            const items: readonly DetailListItem[] = [
                {
                    id: 'drawdown',
                    label: 'Drawdown',
                    value:
                        view.drawdown === null ? (
                            <MissingValue />
                        ) : (
                            `${formatCurrency(view.drawdown.amount)} ${DRAWDOWN_KIND_TEXT[view.drawdown.kind]}`
                        ),
                },
                {
                    id: 'daily-loss-limit',
                    label: 'Daily loss limit',
                    value:
                        view.dailyLossLimit === null ? (
                            <MissingValue />
                        ) : (
                            formatCurrency(view.dailyLossLimit)
                        ),
                },
                {
                    id: 'cushion-percent',
                    label: 'Cushion percent',
                    value: formatPercent(view.cushionPercent, 0),
                },
                {
                    id: 'requires-lock-for-withdrawal',
                    label: 'Requires lock for withdrawal',
                    value: view.requiresLockForWithdrawal ? 'yes' : 'no',
                },
                {
                    id: 'minimum-payout-request',
                    label: 'Minimum payout request',
                    value: formatCurrency(view.minPayoutRequest),
                },
                {
                    id: 'contract-limit',
                    label: 'Contract limit',
                    value: contractLimitLabel(view.contractLimit),
                },
            ];
            return (
                <div className="flex flex-col gap-4">
                    <DetailList items={items} />
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
                <EmptyState
                    icon={Radar}
                    size={EmptyStateSize.Compact}
                    title="No live stage is modeled for this plan"
                />
            );
        }
        case LiveRulesCardKind.Pending: {
            return (
                <EmptyState
                    action={<EnterBalancesButton />}
                    icon={Radar}
                    size={EmptyStateSize.Compact}
                    title="Enter a live balance to see the live rules"
                />
            );
        }
    }
}

function contractLimitLabel(limit: LiveContractCaps): ReactNode {
    const parts = [
        limit.minis === null ? null : `${limit.minis} minis`,
        limit.micros === null ? null : `${limit.micros} micros`,
    ].filter((part) => part !== null);
    return parts.length === 0 ? <MissingValue /> : parts.join(' / ');
}
