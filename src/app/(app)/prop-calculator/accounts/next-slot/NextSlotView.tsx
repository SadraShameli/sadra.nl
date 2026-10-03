'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import { ObjectiveChip } from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { NextSlotSortKey, PortfolioLedger } from '~/lib/prop-accounts';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { type SizingObjective } from '~/lib/prop-calculator/advisor';
import { api } from '~/trpc/react';

import {
    type NextSlotListedViewRow,
    type NextSlotModel,
    nextSlotModelOf,
    type NextSlotRankedViewRow,
    nextSlotRequestsOf,
} from './nextSlotModel';

const sortKeySchema = z.enum(NextSlotSortKey);

export function NextSlotView({ userId }: { readonly userId: string }) {
    const today = useTodayIsoDate();
    const [objective, setObjective] = useState<null | SizingObjective>(null);
    const [sortKey, setSortKey] = useState(NextSlotSortKey.Objective);
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const transfersQuery = api.propAccounts.bankroll.list.useQuery();
    const engagementsQuery = api.propAccounts.firmEngagement.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const edgeQuery = api.propAccounts.edge.summary.useQuery(ALL_JOURNAL_DAYS);

    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const fees = feesQuery.data;
    const payouts = payoutsQuery.data;
    const transfers = transfersQuery.data;
    const engagements = engagementsQuery.data;
    const rulebook = rulebookQuery.data;

    const ledger = useMemo(
        () =>
            accounts === undefined ||
            events === undefined ||
            fees === undefined ||
            payouts === undefined ||
            transfers === undefined ||
            engagements === undefined
                ? null
                : PortfolioLedger.fromRows(userId, {
                      accounts,
                      events,
                      fees,
                      firmEngagements: engagements,
                      payouts,
                      transfers,
                  }),
        [accounts, engagements, events, fees, payouts, transfers, userId],
    );
    const requests = useMemo(
        () =>
            ledger === null || rulebook === undefined
                ? []
                : nextSlotRequestsOf(ledger, rulebook, today),
        [ledger, rulebook, today],
    );
    const engine = useOverviewWorker(requests);
    const isJournalPending = edgeQuery.isPending;
    const trades = edgeQuery.data?.summary.sampleSize ?? 0;
    const model = useMemo(
        () =>
            ledger === null || rulebook === undefined || isJournalPending
                ? null
                : nextSlotModelOf({
                      engine,
                      ledger,
                      objective: objective ?? undefined,
                      requests,
                      rulebook,
                      sortKey,
                      today,
                      trades,
                  }),
        [
            engine,
            isJournalPending,
            ledger,
            objective,
            requests,
            rulebook,
            sortKey,
            today,
            trades,
        ],
    );

    const failed = [
        accountsQuery,
        eventsQuery,
        feesQuery,
        payoutsQuery,
        transfersQuery,
        engagementsQuery,
        rulebookQuery,
    ].find((query) => query.isError && query.data === undefined);
    if (failed?.error) {
        return (
            <QueryErrorNotice
                message={failed.error.message}
                title="Next slot could not be loaded"
            />
        );
    }
    if (model === null) {
        return (
            <div aria-busy="true" aria-label="Loading next slot">
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-8">
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <p className="text-xs text-destructive">
                    Your journal could not be loaded, so the scale gate treats
                    your trade count as zero: {edgeQuery.error.message}
                </p>
            )}
            {model.engineFailure !== null && (
                <QueryErrorNotice
                    message={model.engineFailure}
                    title="The engine runs could not be completed"
                />
            )}
            <Progress model={model} />
            <Section id="ranked" title="Ranked">
                <RankedTable
                    model={model}
                    onObjectiveChange={setObjective}
                    onSortKeyChange={setSortKey}
                    pickedObjective={objective}
                />
            </Section>
            <ListedSection
                description="A firm with an unverified cap scope or live trigger is listed here with its optimistic figures and never ranked."
                id="unverified"
                rows={model.unverified}
                title="Listed, not ranked: unverified"
            />
            <ListedSection
                description="Plans the engine refused, or whose run failed."
                id="not-rankable"
                rows={model.refused}
                title="Not rankable"
            />
            <ListedSection
                description="Plans whose engine run has not finished."
                id="pending"
                rows={model.pending}
                title="Still computing"
            />
            <ListedSection
                description="Plans left out of the ranking, each with its reason."
                id="excluded"
                rows={model.excluded}
                title="Excluded"
            />
            <Section id="assumptions" title="Assumptions">
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {[...model.assumptions, ...model.disclosures].map(
                        (disclosure) => (
                            <li key={disclosure}>{disclosure}</li>
                        ),
                    )}
                </ul>
            </Section>
        </div>
    );
}

function ListedSection({
    description,
    id,
    rows,
    title,
}: {
    readonly description: string;
    readonly id: string;
    readonly rows: readonly NextSlotListedViewRow[];
    readonly title: string;
}) {
    if (rows.length === 0) return null;
    return (
        <Section id={id} title={title}>
            <p className="mb-3 text-sm text-muted-foreground">{description}</p>
            <Table {...namedScrollRegion(`next-slot-${id}`)}>
                <TableHeader>
                    <TableRow>
                        <TableHead scope="col">Firm</TableHead>
                        <TableHead scope="col">Plan</TableHead>
                        <TableHead className="text-right" scope="col">
                            Documented monthly net, credit-inclusive
                        </TableHead>
                        <TableHead scope="col">Reason</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.firm}</TableCell>
                            <TableCell>{row.plan}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.documentedNet}
                            </TableCell>
                            <TableCell>
                                <ul className="flex flex-col gap-1 text-xs">
                                    {row.reasons.map((reason) => (
                                        <li key={reason}>{reason}</li>
                                    ))}
                                </ul>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Section>
    );
}

function namedScrollRegion(labelledBy: string) {
    return {
        'aria-labelledby': labelledBy,
        containerProps: {
            'aria-labelledby': labelledBy,
            role: 'region',
            tabIndex: 0,
        },
    } as const;
}

function Progress({ model }: { readonly model: NextSlotModel }) {
    if (!model.isProvisional) return null;
    return (
        <p className="text-sm text-amber-400" role="status">
            Provisional ranking: {model.computed} of {model.requested} engine
            runs done. Plans join the ranking as their runs finish, so ranks,
            the payout-policy sensitive marks and the slots to fill can still
            change.
        </p>
    );
}

function RankedRow({ row }: { readonly row: NextSlotRankedViewRow }) {
    const notes = [
        row.policySensitiveNote,
        row.optimumNote,
        row.minimumNote,
        row.nonPositiveNote,
        row.scaleNote,
        row.capacityNote,
        ...row.notes,
    ].filter((note): note is string => note !== null);
    return (
        <TableRow>
            <TableCell className="tabular-nums">{row.rank}</TableCell>
            <TableCell>
                {row.firm} {row.plan}
                {notes.map((note) => (
                    <span className="block text-xs text-amber-400" key={note}>
                        {note}
                    </span>
                ))}
                {row.liveTransferNotes.length > 0 && (
                    <ul
                        aria-label="Live-transfer and payout-trigger assumptions behind this plan"
                        className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground"
                    >
                        {row.liveTransferNotes.map((note) => (
                            <li key={note}>{note}</li>
                        ))}
                    </ul>
                )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.documentedNet}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
                {row.creditFree}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.request}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.optimumNet}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.optimumRequest}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.optimumBust}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.documentedRank}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.optimumRank}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.cycleNet}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.noPayout}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.batchLoss}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.perScreenHour}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.freeSlots}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {row.allocatable}
            </TableCell>
        </TableRow>
    );
}

function RankedTable({
    model,
    onObjectiveChange,
    onSortKeyChange,
    pickedObjective,
}: {
    readonly model: NextSlotModel;
    readonly onObjectiveChange: (objective: SizingObjective) => void;
    readonly onSortKeyChange: (sortKey: NextSlotSortKey) => void;
    readonly pickedObjective: null | SizingObjective;
}) {
    return (
        <div className="flex flex-col gap-3">
            <ObjectiveChip
                choiceNotes={[
                    ...(model.objectiveChoiceNote === null
                        ? []
                        : [model.objectiveChoiceNote]),
                    ...(model.objectiveFallbackNote === null
                        ? []
                        : [model.objectiveFallbackNote]),
                    ...(model.objectiveNotAppliedNote === null
                        ? []
                        : [model.objectiveNotAppliedNote]),
                ]}
                objective={pickedObjective ?? model.automaticObjective}
                onChange={onObjectiveChange}
            />
            <SortKeySelect
                isHourKeyAvailable={model.isHourKeyAvailable}
                onChange={onSortKeyChange}
                sortKey={model.sortKey}
            />
            <p className="text-sm text-muted-foreground">{model.sortNote}</p>
            {model.capacityNote !== null && (
                <p className="text-sm text-muted-foreground">
                    {model.capacityNote}
                </p>
            )}
            {model.ranked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No plan is ranked yet: every plan is either still computing
                    or listed below with its reason.
                </p>
            ) : (
                <>
                    <Table {...namedScrollRegion('next-slot-ranked')}>
                        <TableHeader>
                            <TableRow>
                                <TableHead scope="col">Rank</TableHead>
                                <TableHead scope="col">Plan</TableHead>
                                <TableHead className="text-right" scope="col">
                                    Documented monthly net, credit-inclusive
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Documented, credit-free
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Documented request
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Payout-size optimum, credit-inclusive
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Optimum request
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Funded bust at the optimum, share of all
                                    simulated attempts
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Rank, documented
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Rank, optimum
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Cycle net
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    P(no payout) per attempt
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Batch loss risk at your bankroll
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Net per screen hour
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Free slots
                                </TableHead>
                                <TableHead className="text-right" scope="col">
                                    Slots to fill
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.ranked.map((row) => (
                                <RankedRow key={row.key} row={row} />
                            ))}
                        </TableBody>
                    </Table>
                    <div className="flex flex-col gap-2">
                        {model.ranked.map((row) => (
                            <p
                                className="text-xs text-muted-foreground"
                                key={row.key}
                            >
                                {row.firm} {row.plan}: {row.sizing};{' '}
                                {row.labels.join('; ')}.
                            </p>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function Section({
    children,
    id,
    title,
}: {
    readonly children: ReactNode;
    readonly id: string;
    readonly title: string;
}) {
    return (
        <section aria-labelledby={`next-slot-${id}`}>
            <h2
                className="mb-3 text-xl font-semibold text-white"
                id={`next-slot-${id}`}
            >
                {title}
            </h2>
            {children}
        </section>
    );
}

function SortKeySelect({
    isHourKeyAvailable,
    onChange,
    sortKey,
}: {
    readonly isHourKeyAvailable: boolean;
    readonly onChange: (sortKey: NextSlotSortKey) => void;
    readonly sortKey: NextSlotSortKey;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sort by</span>
            <select
                aria-label="Sort by"
                className="h-7 rounded-md border bg-transparent px-2 text-xs disabled:opacity-50"
                disabled={!isHourKeyAvailable}
                onChange={(event) => {
                    const chosen = sortKeySchema.safeParse(event.target.value);
                    if (chosen.success) onChange(chosen.data);
                }}
                value={sortKey}
            >
                <option value={NextSlotSortKey.Objective}>Objective</option>
                <option value={NextSlotSortKey.Hour}>
                    Net per screen hour
                </option>
            </select>
        </div>
    );
}
