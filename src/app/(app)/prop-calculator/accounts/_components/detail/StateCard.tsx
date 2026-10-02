import { formatCurrency } from '~/lib/format';
import {
    AssumptionKind,
    assumptionText,
    ReconstructedLiveKind,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

import { StateCardKind, type StateCardView } from './detailState';

export function StateCard({ view }: { readonly view: StateCardView }) {
    switch (view.kind) {
        case StateCardKind.NoSnapshot: {
            return (
                <p className="text-sm text-muted-foreground">
                    Enter a balance snapshot to see the reconstructed floor,
                    lock and cushion.
                </p>
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
                        As of {view.asOf}
                    </p>
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                        <div className="contents">
                            <dt className="text-muted-foreground">Floor</dt>
                            <dd className="tabular-nums">
                                {floorLock === null
                                    ? 'unavailable'
                                    : formatCurrency(floorLock.floor)}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">Lock</dt>
                            <dd>
                                {floorLock === null
                                    ? 'unavailable'
                                    : floorLock.locked
                                      ? 'locked'
                                      : 'not locked'}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">Cushion</dt>
                            <dd className="tabular-nums">
                                {cushion === null
                                    ? 'unavailable'
                                    : formatCurrency(cushion)}
                            </dd>
                        </div>
                    </dl>
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
