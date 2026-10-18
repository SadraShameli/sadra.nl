import { Gauge } from 'lucide-react';

import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { StatStrip } from '~/components/StatStrip';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCurrency, formatDisplayDate } from '~/lib/format';
import {
    AssumptionKind,
    assumptionText,
    ReconstructedLiveKind,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

import { StateCardKind, type StateCardView } from './detailState';

const UNAVAILABLE = 'unavailable';

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
                    <p className="text-destructive">{view.message}</p>
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
                                    floorLock === null
                                        ? UNAVAILABLE
                                        : formatCurrency(floorLock.floor),
                            },
                            {
                                id: 'lock',
                                label: 'Lock',
                                value:
                                    floorLock === null
                                        ? UNAVAILABLE
                                        : floorLock.locked
                                          ? 'locked'
                                          : 'not locked',
                            },
                            {
                                id: 'cushion',
                                label: 'Cushion',
                                value:
                                    cushion === null
                                        ? UNAVAILABLE
                                        : formatCurrency(cushion),
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
        <ul className="flex flex-col gap-1 text-sm text-destructive">
            {issues.map((issue) => (
                <li key={`${issue.field}-${issue.kind}`}>{issue.message}</li>
            ))}
        </ul>
    );
}
