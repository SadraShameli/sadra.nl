import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { NOT_APPLICABLE } from '~/lib/format';

import { type AttemptEconomicsCardModel } from './overviewModel';
import { InfoLines, InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum AttemptEconomicsCardColumn {
    AttemptCost = 'attempt-cost',
    Attempts = 'attempts',
    AveragePayout = 'average-payout',
    BreakevenPassRate = 'breakeven-pass-rate',
    FundedValue = 'funded-value',
    FundedValueAttemptCost = 'funded-value-attempt-cost',
    MarginAboveBreakeven = 'margin-above-breakeven',
    ModeledEVPerAttempt = 'modeled-ev-per-attempt',
    ModeledFundedValue = 'modeled-funded-value',
    ModeledPassRate = 'modeled-pass-rate',
    ModeledPayoutRate = 'modeled-payout-rate',
    ModeledPayoutsPerPaidFunded = 'modeled-payouts-per-paid-funded',
    PassRate = 'pass-rate',
    PayoutRate = 'payout-rate',
    PayoutsPerPaidFunded = 'payouts-per-paid-funded',
    Plan = 'plan',
    RealizedEVPerAttempt = 'realized-ev-per-attempt',
}

export const AttemptEconomicsCard = memo(function AttemptEconomicsCard({
    model,
}: {
    readonly model: AttemptEconomicsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewPanel section={OverviewSectionId.AttemptEconomics}>
                <p className="text-sm text-muted-foreground">
                    No account with a modeled plan yet.
                </p>
            </OverviewPanel>
        );
    }
    return (
        <OverviewPanel
            info={
                <InfoStack>
                    <ul
                        aria-label="Realized formula by plan"
                        className="flex flex-col gap-1"
                    >
                        {model.rows
                            .filter((row) => row.formula !== NOT_APPLICABLE)
                            .map((row) => (
                                <li key={row.key}>
                                    {row.plan}: {row.formula}
                                </li>
                            ))}
                    </ul>
                    <p>Realized EV per attempt: ignores time.</p>
                    <p>
                        Modeled EV per attempt: the engine&apos;s credit-free
                        net per attempt; it ignores time and is not the ranking
                        objective.
                    </p>
                    <InfoLines lines={model.disclosures} />
                </InfoStack>
            }
            section={OverviewSectionId.AttemptEconomics}
        >
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => <>{row.original.plan}</>,
                        header: 'Plan',
                        id: AttemptEconomicsCardColumn.Plan,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row }) => <>{row.original.attempts}</>,
                        header: 'Attempts',
                        id: AttemptEconomicsCardColumn.Attempts,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.attemptCost}</>,
                        header: 'Attempt cost',
                        id: AttemptEconomicsCardColumn.AttemptCost,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.passRate}</>,
                        header: 'Pass rate',
                        id: AttemptEconomicsCardColumn.PassRate,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.payoutRate}</>,
                        header: 'Payout rate',
                        id: AttemptEconomicsCardColumn.PayoutRate,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.payoutsPerPaidFunded}</>
                        ),
                        header: 'Payouts per paid funded',
                        id: AttemptEconomicsCardColumn.PayoutsPerPaidFunded,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.averagePayout}</>,
                        header: 'Average payout',
                        id: AttemptEconomicsCardColumn.AveragePayout,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.fundedValue}</>,
                        header: 'Funded value',
                        id: AttemptEconomicsCardColumn.FundedValue,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.fundedValueToAttemptCost}</>
                        ),
                        header: 'Funded value / attempt cost',
                        id: AttemptEconomicsCardColumn.FundedValueAttemptCost,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.breakevenPassRate}</>
                        ),
                        header: 'Breakeven pass rate',
                        id: AttemptEconomicsCardColumn.BreakevenPassRate,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.realizedEvPerAttempt}</>
                        ),
                        header: 'Realized EV per attempt',
                        id: AttemptEconomicsCardColumn.RealizedEVPerAttempt,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.modeledEvPerAttempt}
                            </span>
                        ),
                        header: 'Modeled EV per attempt',
                        id: AttemptEconomicsCardColumn.ModeledEVPerAttempt,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.modeledPassRate}
                            </span>
                        ),
                        header: 'Modeled pass rate',
                        id: AttemptEconomicsCardColumn.ModeledPassRate,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.modeledPayoutRate}
                            </span>
                        ),
                        header: 'Modeled payout rate',
                        id: AttemptEconomicsCardColumn.ModeledPayoutRate,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.modeledPayoutsPerPaidFunded}
                            </span>
                        ),
                        header: 'Modeled payouts per paid funded',
                        id: AttemptEconomicsCardColumn.ModeledPayoutsPerPaidFunded,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.modeledFundedValue}
                            </span>
                        ),
                        header: 'Modeled funded value',
                        id: AttemptEconomicsCardColumn.ModeledFundedValue,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.marginAboveBreakeven}</>
                        ),
                        header: 'Margin above breakeven',
                        id: AttemptEconomicsCardColumn.MarginAboveBreakeven,
                        meta: { align: DataTableAlign.End },
                    },
                ]}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </OverviewPanel>
    );
});
