import { Sigma } from 'lucide-react';
import { memo } from 'react';

import {
    type FigureColumn,
    figureColumns,
} from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { ModelFailureNote, ModelStatusPanel } from './ModelStatusPanel';
import { type ExpectedNetCardModel, ExpectedNetStatus } from './overviewModel';
import { InfoLines, InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ExpectedNetCardColumn {
    ActiveFundedSlots = 'active-funded-slots',
    DocumentedPolicyCreditInclusive = 'documented-policy-credit-inclusive',
    DocumentedPolicyMonthlyNetCreditFree = 'documented-policy-monthly-net-credit-free',
    DocumentedRequest = 'documented-request',
    DocumentedTimesSlots = 'documented-times-slots',
    OptimumRequest = 'optimum-request',
    OptimumTimesSlots = 'optimum-times-slots',
    PayoutSizeOptimumCreditInclusive = 'payout-size-optimum-credit-inclusive',
    PayoutSizeOptimumMonthlyNetCreditFree = 'payout-size-optimum-monthly-net-credit-free',
    Plan = 'plan',
    RankDocumented = 'rank-documented',
    RankOptimum = 'rank-optimum',
}

type ExpectedNetRow = ExpectedNetCardModel['rows'][number];

const EXPECTED_NET_FIGURE_COLUMNS: readonly FigureColumn<ExpectedNetRow>[] = [
    {
        align: DataTableAlign.End,
        header: 'Active funded slots',
        id: ExpectedNetCardColumn.ActiveFundedSlots,
        textOf: (row) => row.activeSlots,
    },
    {
        align: DataTableAlign.End,
        header: 'Documented policy, monthly net (credit-free)',
        id: ExpectedNetCardColumn.DocumentedPolicyMonthlyNetCreditFree,
        textOf: (row) => row.documented.creditFree,
    },
    {
        align: DataTableAlign.End,
        className: 'text-muted-foreground',
        header: 'Documented policy, credit-inclusive',
        id: ExpectedNetCardColumn.DocumentedPolicyCreditInclusive,
        textOf: (row) => row.documented.creditInclusive,
    },
    {
        align: DataTableAlign.End,
        header: 'Documented request',
        id: ExpectedNetCardColumn.DocumentedRequest,
        textOf: (row) => row.documented.requestSize,
    },
    {
        align: DataTableAlign.End,
        header: 'Documented times slots',
        id: ExpectedNetCardColumn.DocumentedTimesSlots,
        textOf: (row) => row.documented.totalCreditFree,
    },
    {
        align: DataTableAlign.End,
        header: 'Payout-size optimum, monthly net (credit-free)',
        id: ExpectedNetCardColumn.PayoutSizeOptimumMonthlyNetCreditFree,
        textOf: (row) => row.optimum.creditFree,
    },
    {
        align: DataTableAlign.End,
        className: 'text-muted-foreground',
        header: 'Payout-size optimum, credit-inclusive',
        id: ExpectedNetCardColumn.PayoutSizeOptimumCreditInclusive,
        textOf: (row) => row.optimum.creditInclusive,
    },
    {
        align: DataTableAlign.End,
        header: 'Optimum request',
        id: ExpectedNetCardColumn.OptimumRequest,
        textOf: (row) => row.optimum.requestSize,
    },
    {
        align: DataTableAlign.End,
        header: 'Optimum times slots',
        id: ExpectedNetCardColumn.OptimumTimesSlots,
        textOf: (row) => row.optimum.totalCreditFree,
    },
    {
        align: DataTableAlign.End,
        header: 'Rank, documented',
        id: ExpectedNetCardColumn.RankDocumented,
        textOf: (row) => row.rankDocumented,
    },
    {
        align: DataTableAlign.End,
        header: 'Rank, optimum',
        id: ExpectedNetCardColumn.RankOptimum,
        textOf: (row) => row.rankOptimum,
    },
];

export const ExpectedNetCard = memo(function ExpectedNetCard({
    model,
}: {
    readonly model: ExpectedNetCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <ModelStatusPanel
                emptyTitle="No modeled plan to value yet"
                icon={Sigma}
                section={OverviewSectionId.ExpectedNet}
                status={model.status}
                statusNote={model.statusNote}
            />
        );
    }
    return (
        <OverviewPanel
            info={<ExpectedNetInfo model={model} />}
            isComputing={model.status === ExpectedNetStatus.Pending}
            section={OverviewSectionId.ExpectedNet}
        >
            <ModelFailureNote
                status={model.status}
                statusNote={model.statusNote}
            />
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => (
                            <>
                                {row.original.plan}
                                {row.original.policySensitiveNote !== null && (
                                    <span className="block text-xs text-warning">
                                        {row.original.policySensitiveNote}
                                    </span>
                                )}
                            </>
                        ),
                        header: 'Plan',
                        id: ExpectedNetCardColumn.Plan,
                        meta: { isRowHeader: true },
                    },
                    ...figureColumns(EXPECTED_NET_FIGURE_COLUMNS, model.rows),
                ]}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
            {model.refused.length > 0 && (
                <ul
                    aria-label="Runs the engine refused"
                    className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive"
                >
                    {model.refused.map((refusal) => (
                        <li key={refusal.key}>
                            {refusal.plan}, {refusal.run}: {refusal.reason}
                        </li>
                    ))}
                </ul>
            )}
        </OverviewPanel>
    );
});

function ExpectedNetInfo({ model }: { readonly model: ExpectedNetCardModel }) {
    return (
        <InfoStack>
            {model.rows.map((row) => (
                <p key={row.key}>
                    {row.plan}: {row.labels.startBasis}, {row.labels.trials};{' '}
                    {row.labels.retainedCushion}; {row.labels.payoutPolicy};{' '}
                    {row.labels.lifetimeCapBasis}. {row.labels.creditBasis}
                </p>
            ))}
            {model.rows.some((row) => row.liveTransferNotes.length > 0) && (
                <ul
                    aria-label="Live-transfer and payout-trigger assumptions behind the figures"
                    className="flex flex-col gap-1"
                >
                    {model.rows.flatMap((row) =>
                        row.liveTransferNotes.map((note) => (
                            <li key={`${row.key}-${note}`}>
                                {row.plan}: {note}
                            </li>
                        )),
                    )}
                </ul>
            )}
            <InfoLines lines={model.disclosures} />
        </InfoStack>
    );
}
