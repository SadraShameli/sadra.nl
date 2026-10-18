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
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Skeleton } from '~/components/ui/skeleton';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { NextSlotSortKey, PortfolioLedger } from '~/lib/prop-accounts';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { type SizingObjective } from '~/lib/prop-calculator/advisor';
import { api } from '~/trpc/react';

import {
    type NextSlotListedFirmGroup,
    type NextSlotModel,
    nextSlotModelOf,
    type NextSlotRankedViewRow,
    nextSlotRequestsOf,
} from './nextSlotModel';

enum ListedColumn {
    DocumentedNet = 'documented-net',
    Plan = 'plan',
    PlanReason = 'plan-reason',
}

enum RankedColumn {
    Allocatable = 'allocatable',
    BatchLoss = 'batch-loss',
    CreditFree = 'credit-free',
    CycleNet = 'cycle-net',
    DocumentedNet = 'documented-net',
    DocumentedRank = 'documented-rank',
    FreeSlots = 'free-slots',
    NoPayout = 'no-payout',
    OptimumBust = 'optimum-bust',
    OptimumNet = 'optimum-net',
    OptimumRank = 'optimum-rank',
    OptimumRequest = 'optimum-request',
    PerScreenHour = 'per-screen-hour',
    Plan = 'plan',
    Rank = 'rank',
    Request = 'request',
}

const sortKeySchema = z.enum(NextSlotSortKey);

const SORT_SELECT_ID = 'next-slot-sort';

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
                groups={model.unverified}
                id="unverified"
                title="Listed, not ranked: unverified"
            />
            <ListedSection
                description="Plans the engine refused, or whose run failed."
                groups={model.refused}
                id="not-rankable"
                title="Not rankable"
            />
            <ListedSection
                description="Plans whose engine run has not finished."
                groups={model.pending}
                id="pending"
                title="Still computing"
            />
            <ListedSection
                description="Plans left out of the ranking, each with its reason."
                groups={model.excluded}
                id="excluded"
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
    groups,
    id,
    title,
}: {
    readonly description: string;
    readonly groups: readonly NextSlotListedFirmGroup[];
    readonly id: string;
    readonly title: string;
}) {
    if (groups.length === 0) return null;
    return (
        <Section id={id} title={title}>
            <p className="mb-3 text-sm text-muted-foreground">{description}</p>
            <DataTable
                columns={LISTED_COLUMNS}
                data={listedLinesOf(groups)}
                isSortable={false}
                labelledBy={`next-slot-${id}`}
                pageSize={null}
                rowGroupHeading={(line) =>
                    line.kind === ListedLine.Firm ? (
                        <>
                            <span className="block font-semibold text-foreground">
                                {line.group.firm}
                            </span>
                            <ReasonList reasons={line.group.reasons} />
                        </>
                    ) : undefined
                }
                rowId={(line) =>
                    line.kind === ListedLine.Firm
                        ? `firm-${line.group.key}`
                        : line.row.key
                }
            />
        </Section>
    );
}

function Progress({ model }: { readonly model: NextSlotModel }) {
    if (!model.isProvisional) return null;
    return (
        <p className="text-sm text-warning" role="status">
            Provisional ranking: {model.computed} of {model.requested} engine
            runs done. Plans join the ranking as their runs finish, so ranks,
            the payout-policy sensitive marks and the slots to fill can still
            change.
        </p>
    );
}

function rankedFigure(
    id: RankedColumn,
    header: string,
    figure: (row: NextSlotRankedViewRow) => ReactNode,
    isMuted = false,
): DataTableColumn<NextSlotRankedViewRow> {
    return {
        cell: ({ row: { original: row } }) =>
            isMuted ? (
                <span className="text-muted-foreground">{figure(row)}</span>
            ) : (
                figure(row)
            ),
        header,
        id,
        meta: { align: DataTableAlign.End },
    };
}

function rankedNotesOf(row: NextSlotRankedViewRow): readonly string[] {
    return [
        row.policySensitiveNote,
        row.optimumNote,
        row.minimumNote,
        row.nonPositiveNote,
        row.scaleNote,
        row.capacityNote,
        ...row.notes,
    ].filter((note): note is string => note !== null);
}

const RANKED_COLUMNS: DataTableColumn<NextSlotRankedViewRow>[] = [
    {
        cell: ({ row: { original: row } }) => (
            <span className="tabular-nums">{row.rank}</span>
        ),
        header: 'Rank',
        id: RankedColumn.Rank,
    },
    {
        cell: ({ row: { original: row } }) => (
            <>
                {row.firm} {row.plan}
                {rankedNotesOf(row).map((note) => (
                    <span className="block text-xs text-warning" key={note}>
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
            </>
        ),
        header: 'Plan',
        id: RankedColumn.Plan,
    },
    rankedFigure(
        RankedColumn.DocumentedNet,
        'Documented monthly net, credit-inclusive',
        (row) => row.documentedNet,
    ),
    rankedFigure(
        RankedColumn.CreditFree,
        'Documented, credit-free',
        (row) => row.creditFree,
        true,
    ),
    rankedFigure(
        RankedColumn.Request,
        'Documented request',
        (row) => row.request,
    ),
    rankedFigure(
        RankedColumn.OptimumNet,
        'Payout-size optimum, credit-inclusive',
        (row) => row.optimumNet,
    ),
    rankedFigure(
        RankedColumn.OptimumRequest,
        'Optimum request',
        (row) => row.optimumRequest,
    ),
    rankedFigure(
        RankedColumn.OptimumBust,
        'Funded bust at the optimum, share of all simulated attempts',
        (row) => row.optimumBust,
    ),
    rankedFigure(
        RankedColumn.DocumentedRank,
        'Rank, documented',
        (row) => row.documentedRank,
    ),
    rankedFigure(
        RankedColumn.OptimumRank,
        'Rank, optimum',
        (row) => row.optimumRank,
    ),
    rankedFigure(RankedColumn.CycleNet, 'Cycle net', (row) => row.cycleNet),
    rankedFigure(
        RankedColumn.NoPayout,
        'P(no payout) per attempt',
        (row) => row.noPayout,
    ),
    rankedFigure(
        RankedColumn.BatchLoss,
        'Batch loss risk at your bankroll',
        (row) => row.batchLoss,
    ),
    rankedFigure(
        RankedColumn.PerScreenHour,
        'Net per screen hour',
        (row) => row.perScreenHour,
    ),
    rankedFigure(RankedColumn.FreeSlots, 'Free slots', (row) => row.freeSlots),
    rankedFigure(
        RankedColumn.Allocatable,
        'Slots to fill',
        (row) => row.allocatable,
    ),
];

enum ListedLine {
    Firm = 'firm',
    Plan = 'plan',
}

type ListedLineRow =
    | {
          readonly group: NextSlotListedFirmGroup;
          readonly kind: ListedLine.Firm;
      }
    | { readonly kind: ListedLine.Plan; readonly row: ListedPlanRow };

type ListedPlanRow = NextSlotListedFirmGroup['plans'][number];

function listedLinesOf(
    groups: readonly NextSlotListedFirmGroup[],
): ListedLineRow[] {
    return groups.flatMap((group): ListedLineRow[] => [
        { group, kind: ListedLine.Firm },
        ...group.plans.map((row): ListedLineRow => ({
            kind: ListedLine.Plan,
            row,
        })),
    ]);
}

function listedPlanCell(
    render: (row: ListedPlanRow) => ReactNode,
): DataTableColumn<ListedLineRow>['cell'] {
    return ({ row: { original: line } }) =>
        line.kind === ListedLine.Plan ? render(line.row) : null;
}

const LISTED_COLUMNS: DataTableColumn<ListedLineRow>[] = [
    {
        cell: listedPlanCell((row) => row.plan),
        header: 'Plan',
        id: ListedColumn.Plan,
    },
    {
        cell: listedPlanCell((row) => row.documentedNet),
        header: 'Documented monthly net, credit-inclusive',
        id: ListedColumn.DocumentedNet,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: listedPlanCell((row) => <ReasonList reasons={row.reasons} />),
        header: 'Plan reason',
        id: ListedColumn.PlanReason,
    },
];

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
                    <DataTable
                        columns={RANKED_COLUMNS}
                        data={[...model.ranked]}
                        isSortable={false}
                        labelledBy="next-slot-ranked"
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
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

function ReasonList({ reasons }: { readonly reasons: readonly string[] }) {
    if (reasons.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1 text-xs font-normal text-muted-foreground">
            {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
            ))}
        </ul>
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
                className="mb-3 text-xl font-semibold text-foreground"
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
        <ToolbarSelect
            disabled={!isHourKeyAvailable}
            id={SORT_SELECT_ID}
            label="Sort by"
            onValueChange={(value) => {
                const chosen = sortKeySchema.safeParse(value);
                if (chosen.success) onChange(chosen.data);
            }}
            options={[
                { label: 'Objective', value: NextSlotSortKey.Objective },
                { label: 'Net per screen hour', value: NextSlotSortKey.Hour },
            ]}
            value={sortKey}
        />
    );
}
