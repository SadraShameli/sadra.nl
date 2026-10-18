import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

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

export const EvSourcesCard = memo(function EvSourcesCard({
    model,
}: {
    readonly model: EvSourcesCardModel;
}) {
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
            {model.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No plan you hold yet.
                </p>
            ) : (
                <DataTable
                    aria-label="Conversion EV per attempt by plan"
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.plan}</>,
                            header: 'Plan',
                            id: ConversionEvColumn.Plan,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => <>{row.original.attemptCost}</>,
                            header: 'Attempt cost',
                            id: ConversionEvColumn.AttemptCost,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.passRate}</>,
                            header: 'Pass rate',
                            id: ConversionEvColumn.PassRate,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.freshFundedValue}</>
                            ),
                            header: 'Value of a fresh funded account',
                            id: ConversionEvColumn.ValueOfAFreshFundedAccount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.modeledConversionEv}</>
                            ),
                            header: 'Conversion EV per attempt (modeled)',
                            id: ConversionEvColumn.ConversionEVPerAttemptModeled,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.realizedConversionEv}</>
                            ),
                            header: 'Conversion EV per attempt (realized)',
                            id: ConversionEvColumn.ConversionEVPerAttemptRealized,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
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
                                <>{row.account}</>
                            ),
                            header: 'Funded account',
                            id: FundedProgressColumn.FundedAccount,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{row.plan}</>
                            ),
                            header: 'Plan',
                            id: FundedProgressColumn.Plan,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{row.valueNow}</>
                            ),
                            header: 'Value from its own state',
                            id: FundedProgressColumn.ValueFromItsOwnState,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{row.freshFundedValue}</>
                            ),
                            header: 'Value of a fresh funded account',
                            id: FundedProgressColumn.ValueOfAFreshFundedAccount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{row.heldInFundedProgress}</>
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
