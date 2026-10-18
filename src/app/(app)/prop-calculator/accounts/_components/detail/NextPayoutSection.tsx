'use client';

import { useMemo } from 'react';

import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { AccountFromStateDetails } from '~/app/(app)/prop-calculator/accounts/_components/overview/AccountFromStateDetails';
import {
    type AccountFromStateView,
    AccountFromStateViewKind,
    accountFromStateViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import { type SlotEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Skeleton } from '~/components/ui/skeleton';
import {
    type AccountSnapshotInput,
    type ReconstructedAccount,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    type ChainPositionView,
    ChainPositionViewKind,
    chainPositionViewOf,
    FROM_STATE_PERSONAL_RULES_NOTE,
    type FromStateDetail,
    FromStateDetailKind,
    type FromStateDetailRequests,
    payoutPathLinesOf,
    type RetireView,
    RetireViewKind,
    retireViewOf,
} from './fromStateDetail';

export function NextPayoutSection({
    account,
    detail,
    input,
    rulebook,
    rulebookError,
}: {
    readonly account: ReconstructedAccount;
    readonly detail: FromStateDetail;
    readonly input: AccountSnapshotInput;
    readonly rulebook: RulebookParameters | undefined;
    readonly rulebookError: null | string;
}) {
    if (rulebook === undefined) {
        return rulebookError === null ? (
            <InfoNote>
                Your rulebook has not loaded, so the figures from this state
                cannot be computed yet.
            </InfoNote>
        ) : (
            <SimulationFailureNotice
                message={`Your rulebook could not be loaded, so the figures from this state cannot be computed: ${rulebookError}`}
            />
        );
    }
    if (input.stage === SizingStage.Live) {
        return (
            <InfoNote>A live account has no from-state value model.</InfoNote>
        );
    }
    switch (detail.kind) {
        case FromStateDetailKind.Pending: {
            return (
                <div
                    aria-busy="true"
                    aria-label="Computing the figures from this state"
                    role="status"
                >
                    <Skeleton className="h-24 w-full" />
                </div>
            );
        }
        case FromStateDetailKind.Ready: {
            return (
                <ReadyNextPayout
                    account={account}
                    engine={detail.engine}
                    requests={detail.requests}
                />
            );
        }
        case FromStateDetailKind.Unavailable: {
            return <InfoNote>{detail.reason}</InfoNote>;
        }
    }
}

function ChainPosition({ view }: { readonly view: ChainPositionView }) {
    switch (view.kind) {
        case ChainPositionViewKind.Pending: {
            return (
                <InfoNote role="status">
                    Placing the account in the value chain of its plan...
                </InfoNote>
            );
        }
        case ChainPositionViewKind.Ready: {
            const { above, below, eligibleAssumptions, unavailable } =
                view.model;
            return (
                <div className="flex flex-col gap-2">
                    <PanelSubheading
                        as="h4"
                        info={
                            eligibleAssumptions === null ? undefined : (
                                <>
                                    <p className="font-medium text-ink">
                                        {eligibleAssumptions.heading}
                                    </p>
                                    <ul
                                        aria-label={eligibleAssumptions.heading}
                                        className="list-disc pl-4"
                                    >
                                        {eligibleAssumptions.lines.map(
                                            (line) => (
                                                <li key={line}>{line}</li>
                                            ),
                                        )}
                                    </ul>
                                </>
                            )
                        }
                    >
                        Position in the value chain of the plan
                    </PanelSubheading>
                    <p className="m-0 text-sm text-ink">
                        Credit-free, this account is worth more than{' '}
                        {listText(above)} and no more than {listText(below)}.
                    </p>
                    {unavailable.map((line) => (
                        <StatusRow
                            key={line}
                            title={`Not available: ${line}`}
                            tone={StatusTone.Neutral}
                        />
                    ))}
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
                <div
                    aria-busy="true"
                    aria-label="Computing the figures from this state"
                    role="status"
                >
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

function ReadyNextPayout({
    account,
    engine,
    requests,
}: {
    readonly account: ReconstructedAccount;
    readonly engine: SlotEngine;
    readonly requests: FromStateDetailRequests;
}) {
    const pathLines = useMemo(
        () => payoutPathLinesOf(account, requests.account.spec),
        [account, requests],
    );
    const view = accountFromStateViewOf(engine, requests.account);
    return (
        <div className="flex flex-col gap-4">
            <FromStateBlock view={view} />
            <InfoNote
                info={FROM_STATE_PERSONAL_RULES_NOTE}
                infoTitle="Personal rules"
            >
                Simulated with your personal rules.
            </InfoNote>
            {pathLines !== null && (
                <div className="flex flex-col gap-1">
                    <PanelSubheading as="h4">
                        Path to the next payout
                    </PanelSubheading>
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
                <InfoNote role="status">
                    Comparing with a fresh account of the same plan...
                </InfoNote>
            );
        }
        case RetireViewKind.Ready: {
            const { model } = view;
            return (
                <div className="flex flex-col gap-2">
                    <PanelSubheading
                        as="h4"
                        info={
                            <>
                                <p>
                                    Compared with {model.basis}. {model.note}
                                </p>
                                {model.liveTransferNotes.length > 0 && (
                                    <ul
                                        aria-label="Live-transfer and payout-trigger assumptions behind the retire comparison"
                                        className="flex flex-col gap-1"
                                    >
                                        {model.liveTransferNotes.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        }
                    >
                        Keep or start a fresh account
                    </PanelSubheading>
                    <p className="m-0 text-sm text-ink">{model.verdict}</p>
                    <StatStrip
                        items={[
                            {
                                id: 'keep',
                                label: 'Keeping this account',
                                value: model.keepRate,
                            },
                            ...(model.isComparable
                                ? [
                                      {
                                          id: 'switch',
                                          label: 'A fresh account, after its cost',
                                          value: model.switchRate,
                                      },
                                  ]
                                : []),
                            {
                                id: 'switch-cost',
                                label: 'Cost of switching',
                                value: model.switchCost,
                            },
                            {
                                id: 'remaining-days',
                                label: 'Days left to earn',
                                value: model.remainingDays,
                            },
                        ]}
                        label="Keep or start a fresh account"
                    />
                    {model.reason !== null && (
                        <InfoNote>{model.reason}</InfoNote>
                    )}
                </div>
            );
        }
    }
}
