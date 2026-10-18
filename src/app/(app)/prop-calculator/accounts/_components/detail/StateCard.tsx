import { Gauge } from 'lucide-react';

import { NO_DASHBOARD_FLOOR_REASON } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { MissingValue } from '~/components/MissingValue';
import { StatStrip } from '~/components/StatStrip';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { WarningNote } from '~/components/WarningNote';
import { formatCurrency, formatDisplayDate } from '~/lib/format';
import {
    AssumptionKind,
    assumptionText,
    ReconstructedLiveKind,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

import { StateCardKind, type StateCardView } from './detailState';

const LIVE_NOT_MODELED_REASON =
    'No live stage is modeled for this plan, so the floor and lock are not reconstructed.';

export function StateCard({ view }: { readonly view: StateCardView }) {
    switch (view.kind) {
        case StateCardKind.NoSnapshot: {
            return (
                <EmptyState
                    action={<EnterBalancesButton />}
                    description="The floor, lock and cushion are reconstructed from the latest balance."
                    icon={Gauge}
                    size={EmptyStateSize.Compact}
                    title="Enter a balance to see the account state"
                />
            );
        }
        case StateCardKind.PeakRequired: {
            return (
                <div className="flex flex-col gap-2 text-sm">
                    <QueryErrorNotice message={view.message} />
                    <IssueList issues={view.issues} />
                </div>
            );
        }
        case StateCardKind.Ready: {
            const floorLock = floorAndLock(view);
            const { cushion } = view.account;
            return (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                        As of {formatDisplayDate(view.asOf)}
                    </p>
                    <StatStrip
                        items={[
                            {
                                id: 'floor',
                                label: 'Floor',
                                value:
                                    floorLock === null ? (
                                        <MissingValue
                                            reason={LIVE_NOT_MODELED_REASON}
                                        />
                                    ) : (
                                        formatCurrency(floorLock.floor)
                                    ),
                            },
                            {
                                id: 'lock',
                                label: 'Lock',
                                value:
                                    floorLock === null ? (
                                        <MissingValue
                                            reason={LIVE_NOT_MODELED_REASON}
                                        />
                                    ) : floorLock.locked ? (
                                        'locked'
                                    ) : (
                                        'not locked'
                                    ),
                            },
                            {
                                id: 'cushion',
                                label: 'Cushion',
                                value:
                                    cushion === null ? (
                                        <MissingValue
                                            reason={NO_DASHBOARD_FLOOR_REASON}
                                        />
                                    ) : (
                                        formatCurrency(cushion)
                                    ),
                            },
                        ]}
                    />
                    {view.account.assumptions.length > 0 && (
                        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {view.account.assumptions
                                .filter(
                                    (assumption) =>
                                        assumption.kind !==
                                        AssumptionKind.SizingRule,
                                )
                                .map((assumption) => (
                                    <li key={assumption.kind}>
                                        {assumptionText(assumption)}
                                    </li>
                                ))}
                        </ul>
                    )}
                    <IssueList issues={view.issues} />
                </div>
            );
        }
    }
}

function floorAndLock(
    account: StateCardView & { readonly kind: StateCardKind.Ready },
): null | { readonly floor: number; readonly locked: boolean } {
    const { account: reconstructed } = account;
    if (reconstructed.kind === ReconstructedLiveKind.Live) {
        return reconstructed.state === null
            ? null
            : {
                  floor: reconstructed.state.threshold,
                  locked: reconstructed.state.thresholdLocked,
              };
    }
    return {
        floor: reconstructed.state.threshold,
        locked: reconstructed.state.thresholdLocked,
    };
}

function IssueList({
    issues,
}: {
    readonly issues: readonly SnapshotPlausibilityIssue[];
}) {
    if (issues.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1 text-sm">
            {issues.map((issue) => (
                <li key={`${issue.field}-${issue.kind}`}>
                    <WarningNote>{issue.message}</WarningNote>
                </li>
            ))}
        </ul>
    );
}
