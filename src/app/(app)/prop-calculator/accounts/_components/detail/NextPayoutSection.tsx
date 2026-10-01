'use client';

import { useMemo } from 'react';

import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { AccountFromStateDetails } from '~/app/(app)/prop-calculator/accounts/_components/overview/AccountFromStateDetails';
import {
    type AccountFromStateView,
    AccountFromStateViewKind,
    accountFromStateViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
import { Skeleton } from '~/components/ui/Skeleton';
import { type Plan } from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    type MeasuredRebuyLag,
    type ReconstructedAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    type ChainPositionView,
    ChainPositionViewKind,
    chainPositionViewOf,
    fromStateDetailRequestsOf,
    payoutPathLinesOf,
    type RetireView,
    RetireViewKind,
    retireViewOf,
} from './fromStateDetail';

export function NextPayoutSection({
    account,
    input,
    measuredRebuyLag,
    plan,
    rulebook,
}: {
    readonly account: ReconstructedAccount;
    readonly input: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters | undefined;
}) {
    const requests = useMemo(
        () =>
            rulebook === undefined
                ? null
                : fromStateDetailRequestsOf({
                      input,
                      measuredRebuyLag,
                      plan,
                      rulebook,
                  }),
        [input, measuredRebuyLag, plan, rulebook],
    );
    const engineRequests = useMemo(
        () =>
            requests === null
                ? []
                : [requests.account, requests.retire, requests.chain],
        [requests],
    );
    const engine = useOverviewWorker(engineRequests);
    const pathLines = useMemo(
        () =>
            requests === null
                ? null
                : payoutPathLinesOf(account, requests.account.spec),
        [account, requests],
    );

    if (rulebook === undefined) {
        return (
            <p className="text-sm text-muted-foreground">
                Your rulebook has not loaded, so the figures from this state
                cannot be computed yet.
            </p>
        );
    }
    if (requests === null) {
        return (
            <p className="text-sm text-muted-foreground">
                A live account has no from-state value model.
            </p>
        );
    }
    const view = accountFromStateViewOf(engine, requests.account);
    return (
        <div className="flex flex-col gap-4">
            <FromStateBlock view={view} />
            {pathLines !== null && (
                <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-medium">Path to the next payout</h4>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                        {pathLines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>
            )}
            {view.kind === AccountFromStateViewKind.Ready && (
                <ChainPosition view={chainPositionViewOf(engine, requests)} />
            )}
            <RetireInformation view={retireViewOf(engine, requests.retire)} />
        </div>
    );
}

function ChainPosition({ view }: { readonly view: ChainPositionView }) {
    switch (view.kind) {
        case ChainPositionViewKind.Pending: {
            return (
                <p className="text-xs text-muted-foreground">
                    Placing the account in the value chain of its plan...
                </p>
            );
        }
        case ChainPositionViewKind.Ready: {
            const { above, below, unavailable } = view.model;
            return (
                <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-medium">
                        Position in the value chain of the plan
                    </h4>
                    <p className="text-sm text-muted-foreground">
                        Credit-free, this account is worth more than{' '}
                        {listText(above)} and no more than {listText(below)}.
                    </p>
                    {unavailable.length > 0 && (
                        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-400">
                            {unavailable.map((line) => (
                                <li key={line}>Not available: {line}</li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }
        case ChainPositionViewKind.Unavailable: {
            return (
                <SimulationFailureNotice
                    message={`Value chain: ${view.reason}`}
                />
            );
        }
    }
}

function FromStateBlock({ view }: { readonly view: AccountFromStateView }) {
    switch (view.kind) {
        case AccountFromStateViewKind.Failed:
        case AccountFromStateViewKind.Refused: {
            return <SimulationFailureNotice message={view.reason} />;
        }
        case AccountFromStateViewKind.Pending: {
            return (
                <div aria-busy="true" aria-label="Computing the figures from this state">
                    <Skeleton className="h-24 w-full" />
                </div>
            );
        }
        case AccountFromStateViewKind.Ready: {
            return <AccountFromStateDetails model={view.model} />;
        }
    }
}

function listText(labels: readonly string[]): string {
    return labels.length === 0 ? 'none of the steps' : labels.join(', ');
}

function RetireInformation({ view }: { readonly view: RetireView }) {
    switch (view.kind) {
        case RetireViewKind.Failed:
        case RetireViewKind.Refused: {
            return (
                <SimulationFailureNotice
                    message={`Retire comparison: ${view.reason}`}
                />
            );
        }
        case RetireViewKind.Pending: {
            return (
                <p className="text-xs text-muted-foreground">
                    Comparing with a fresh account of the same plan...
                </p>
            );
        }
        case RetireViewKind.Ready: {
            const { model } = view;
            return (
                <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-medium">
                        Keep or start a fresh account
                    </h4>
                    <p className="text-sm">{model.verdict}</p>
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                        <dt className="text-muted-foreground">Keeping this account</dt>
                        <dd className="tabular-nums">{model.keepRate}</dd>
                        <dt className="text-muted-foreground">
                            A fresh account, after its cost
                        </dt>
                        <dd className="tabular-nums">{model.switchRate}</dd>
                        <dt className="text-muted-foreground">Cost of switching</dt>
                        <dd className="tabular-nums">{model.switchCost}</dd>
                        <dt className="text-muted-foreground">Days left to earn</dt>
                        <dd className="tabular-nums">{model.remainingDays}</dd>
                    </dl>
                    {model.reason !== null && (
                        <p className="text-sm text-muted-foreground">
                            {model.reason}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Compared with {model.basis}. {model.note}
                    </p>
                </div>
            );
        }
    }
}
