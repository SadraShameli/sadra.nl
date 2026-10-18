import { Sigma } from 'lucide-react';
import { memo } from 'react';

import {
    type FigureColumn,
    figureColumns,
    FigureText,
} from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import { type EvSourcesCardModel } from './overviewModel';
import { InfoLines, InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ConversionEvColumn {
    AttemptCost = 'attempt-cost',
    ConversionEVPerAttemptModeled = 'conversion-ev-per-attempt-modeled',
    ConversionEVPerAttemptRealized = 'conversion-ev-per-attempt-realized',
    PassRate = 'pass-rate',
    Plan = 'plan',
    ValueOfAFreshFundedAccount = 'value-of-a-fresh-funded-account',
}

enum FundedProgressColumn {
    FundedAccount = 'funded-account',
    HeldInFundedProgress = 'held-in-funded-progress',
    Plan = 'plan',
    ValueFromItsOwnState = 'value-from-its-own-state',
    ValueOfAFreshFundedAccount = 'value-of-a-fresh-funded-account',
}

type EvSourcePlanRow = EvSourcesCardModel['plans'][number];

const EV_PLAN_COLUMNS: readonly FigureColumn<EvSourcePlanRow>[] = [
    {
        header: 'Plan',
        id: ConversionEvColumn.Plan,
        isRowHeader: true,
        textOf: (row) => row.plan,
    },
    {
        align: DataTableAlign.End,
        header: 'Attempt cost',
        id: ConversionEvColumn.AttemptCost,
        textOf: (row) => row.attemptCost,
    },
    {
        align: DataTableAlign.End,
        header: 'Pass rate',
        id: ConversionEvColumn.PassRate,
        textOf: (row) => row.passRate,
    },
    {
        align: DataTableAlign.End,
        header: 'Value of a fresh funded account',
        id: ConversionEvColumn.ValueOfAFreshFundedAccount,
        textOf: (row) => row.freshFundedValue,
    },
    {
        align: DataTableAlign.End,
        header: 'Conversion EV per attempt (modeled)',
        id: ConversionEvColumn.ConversionEVPerAttemptModeled,
        textOf: (row) => row.modeledConversionEv,
    },
    {
        align: DataTableAlign.End,
        header: 'Conversion EV per attempt (realized)',
        id: ConversionEvColumn.ConversionEVPerAttemptRealized,
        textOf: (row) => row.realizedConversionEv,
    },
];

export const EvSourcesCard = memo(function EvSourcesCard({
    model,
}: {
    readonly model: EvSourcesCardModel;
}) {
    const planColumns = figureColumns(EV_PLAN_COLUMNS, model.plans);
    const hasPlanFigures = planColumns.some(
        (column) => column.id !== ConversionEvColumn.Plan,
    );
    return (
        <OverviewPanel
            info={
                <InfoStack>
                    {model.liveTransferNotes.length > 0 && (
                        <ul
                            aria-label="Live-transfer and payout-trigger assumptions behind the values"
                            className="flex flex-col gap-1"
                        >
                            {model.liveTransferNotes.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    )}
                    <InfoLines lines={model.disclosures} />
                </InfoStack>
            }
            section={OverviewSectionId.EvSources}
        >
            {!hasPlanFigures || model.plans.length === 0 ? (
                <EmptyState
                    icon={Sigma}
                    size={EmptyStateSize.Compact}
                    title={
                        model.plans.length === 0
                            ? 'No plan you hold yet'
                            : 'No EV figure to show yet'
                    }
                />
            ) : (
                <DataTable
                    aria-label="Conversion EV per attempt by plan"
                    columns={planColumns}
                    data={[...model.plans]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.accounts.length > 0 && (
                <DataTable
                    aria-label="Value held in funded progress by account"
                    columns={[
                        {
                            cell: ({ row: { original: row } }) => (
                                <FigureText text={row.account} />
                            ),
                            header: 'Funded account',
                            id: FundedProgressColumn.FundedAccount,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <FigureText text={row.plan} />
                            ),
                            header: 'Plan',
                            id: FundedProgressColumn.Plan,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <FigureText text={row.valueNow} />
                            ),
                            header: 'Value from its own state',
                            id: FundedProgressColumn.ValueFromItsOwnState,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <FigureText text={row.freshFundedValue} />
                            ),
                            header: 'Value of a fresh funded account',
                            id: FundedProgressColumn.ValueOfAFreshFundedAccount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <FigureText text={row.heldInFundedProgress} />
                            ),
                            header: `Held in funded progress (${model.heldLabel})`,
                            id: FundedProgressColumn.HeldInFundedProgress,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.accounts]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
        </OverviewPanel>
    );
});
