'use client';

import { ListOrdered } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import {
    ObjectiveNotes,
    ObjectiveSelect,
} from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { NextSlotSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import {
    type FigureColumn,
    figureColumns,
    FigureText,
} from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import {
    hasFigure,
    isPendingFigure,
} from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
import {
    JournalErrorNotice,
    QueryErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { FilterToolbar } from '~/components/FilterToolbar';
import { InfoNote } from '~/components/InfoNote';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Field, FieldLabel } from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';
import { Skeleton } from '~/components/ui/skeleton';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { WarningNote } from '~/components/WarningNote';
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
        return <NextSlotSkeleton />;
    }
    return (
        <div className="flex flex-col gap-8">
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <JournalErrorNotice message={edgeQuery.error.message} />
            )}
            {model.engineFailure !== null && (
                <QueryErrorNotice
                    message={model.engineFailure}
                    title="The engine runs could not be completed"
                />
            )}
            <Progress model={model} />
            <Section
                id="ranked"
                info={<RankedInfo model={model} />}
                isComputing={model.isProvisional}
                title="Ranked"
            >
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
    const isComputing = groups.some((group) =>
        group.plans.some((row) => isPendingFigure(row.documentedNet)),
    );
    return (
        <Section
            description={description}
            id={id}
            isComputing={isComputing}
            title={title}
        >
            <DataTable
                columns={listedColumnsOf(groups)}
                data={listedLinesOf(groups)}
                isSortable={false}
                labelledBy={`next-slot-${id}`}
                pageSize={null}
                rowGroupHeading={(line) =>
                    line.kind === ListedLine.Firm ? (
                        <span className="flex flex-wrap items-center gap-2">
                            {line.group.firm}
                            <Badge>Unverified</Badge>
                            {line.group.reasons.length > 0 && (
                                <InfoPopover
                                    title={`Why ${line.group.firm} is unverified`}
                                >
                                    <ReasonList reasons={line.group.reasons} />
                                </InfoPopover>
                            )}
                        </span>
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
        <StatusRow
            detail="Plans join the ranking as their runs finish, so ranks, the payout-policy sensitive marks and the slots to fill can still change."
            title={`Provisional ranking: ${String(model.computed)} of ${String(model.requested)} engine runs done.`}
            tone={StatusTone.Warn}
        />
    );
}

function rankedFigure(
    id: RankedColumn,
    header: string,
    textOf: (row: NextSlotRankedViewRow) => string,
    isMuted = false,
): FigureColumn<NextSlotRankedViewRow> {
    return {
        align: DataTableAlign.End,
        className: isMuted ? 'text-muted-foreground' : undefined,
        header,
        id,
        textOf,
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

const RANKED_LEAD_COLUMNS: DataTableColumn<NextSlotRankedViewRow>[] = [
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
                    <WarningNote className="flex text-xs" key={note}>
                        {note}
                    </WarningNote>
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
        meta: { isRowHeader: true },
    },
];

const RANKED_FIGURE_COLUMNS: readonly FigureColumn<NextSlotRankedViewRow>[] = [
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

function listedColumnsOf(
    groups: readonly NextSlotListedFirmGroup[],
): DataTableColumn<ListedLineRow>[] {
    const plans = groups.flatMap((group) => group.plans);
    const hasPlanReason = plans.some((row) => row.reasons.length > 0);
    const hasDocumentedNet = plans.some((row) => hasFigure(row.documentedNet));
    return [
        {
            cell: listedPlanCell((row) => row.plan),
            header: 'Plan',
            id: ListedColumn.Plan,
            meta: { isRowHeader: true },
        },
        ...(hasDocumentedNet
            ? [
                  {
                      cell: listedPlanCell((row) => (
                          <FigureText text={row.documentedNet} />
                      )),
                      header: 'Documented monthly net, credit-inclusive',
                      id: ListedColumn.DocumentedNet,
                      meta: { align: DataTableAlign.End },
                  },
              ]
            : []),
        ...(hasPlanReason
            ? [
                  {
                      cell: listedPlanCell((row) => (
                          <ReasonList reasons={row.reasons} />
                      )),
                      header: 'Plan reason',
                      id: ListedColumn.PlanReason,
                  },
              ]
            : []),
    ];
}

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

function RankedInfo({ model }: { readonly model: NextSlotModel }) {
    return (
        <div className="flex flex-col gap-2">
            {model.ranked.map((row) => (
                <p key={row.key}>
                    {row.firm} {row.plan}: {row.sizing}; {row.labels.join('; ')}
                    .
                </p>
            ))}
            <ul
                aria-label="Assumptions"
                className="flex list-disc flex-col gap-1 pl-5"
            >
                {[...model.assumptions, ...model.disclosures].map(
                    (disclosure) => (
                        <li key={disclosure}>{disclosure}</li>
                    ),
                )}
            </ul>
        </div>
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
        <>
            <FilterToolbar label="Ranking controls">
                <ObjectiveSelect
                    objective={pickedObjective ?? model.automaticObjective}
                    onChange={onObjectiveChange}
                />
                <Field className="w-auto gap-2" orientation="horizontal">
                    <FieldLabel htmlFor={SORT_SELECT_ID}>Sort by</FieldLabel>
                    <SortKeySelect
                        isHourKeyAvailable={model.isHourKeyAvailable}
                        onChange={onSortKeyChange}
                        sortKey={model.sortKey}
                    />
                </Field>
            </FilterToolbar>
            <ObjectiveNotes
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
            />
            <InfoNote>{model.sortNote}</InfoNote>
            {model.capacityNote !== null && (
                <InfoNote>{model.capacityNote}</InfoNote>
            )}
            {model.ranked.length === 0 ? (
                model.isProvisional ? (
                    <Skeleton className="h-40 w-full" />
                ) : (
                    <EmptyState
                        description="Every plan is listed below with its reason."
                        icon={ListOrdered}
                        size={EmptyStateSize.Compact}
                        title="No plan to rank"
                    />
                )
            ) : (
                <DataTable
                    columns={[
                        ...RANKED_LEAD_COLUMNS,
                        ...figureColumns(RANKED_FIGURE_COLUMNS, model.ranked),
                    ]}
                    data={[...model.ranked]}
                    isSortable={false}
                    labelledBy="next-slot-ranked"
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
        </>
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
    description,
    id,
    info,
    isComputing = false,
    title,
}: {
    readonly children: ReactNode;
    readonly description?: string;
    readonly id: string;
    readonly info?: ReactNode;
    readonly isComputing?: boolean;
    readonly title: string;
}) {
    return (
        <section aria-labelledby={`next-slot-${id}`}>
            <ToolPanel
                description={description}
                info={info}
                isComputing={isComputing}
                title={title}
                titleId={`next-slot-${id}`}
            >
                {children}
            </ToolPanel>
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
