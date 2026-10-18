import { Calculator } from 'lucide-react';
import { memo } from 'react';

import {
    type FigureColumn,
    figureColumns,
} from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { hasFigure } from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type AttemptEconomicsCardModel } from './overviewModel';
import {
    InfoLines,
    InfoStack,
    OverviewEmptyPanel,
    OverviewPanel,
} from './OverviewPanel';
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

type AttemptEconomicsRow = AttemptEconomicsCardModel['rows'][number];

const MODELED_CLASS = 'text-muted-foreground';

const ATTEMPT_ECONOMICS_COLUMNS: readonly FigureColumn<AttemptEconomicsRow>[] =
    [
        {
            header: 'Plan',
            id: AttemptEconomicsCardColumn.Plan,
            isRowHeader: true,
            textOf: (row) => row.plan,
        },
        {
            align: DataTableAlign.End,
            header: 'Attempts',
            id: AttemptEconomicsCardColumn.Attempts,
            textOf: (row) => row.attempts,
        },
        {
            align: DataTableAlign.End,
            header: 'Attempt cost',
            id: AttemptEconomicsCardColumn.AttemptCost,
            textOf: (row) => row.attemptCost,
        },
        {
            align: DataTableAlign.End,
            header: 'Pass rate',
            id: AttemptEconomicsCardColumn.PassRate,
            textOf: (row) => row.passRate,
        },
        {
            align: DataTableAlign.End,
            header: 'Payout rate',
            id: AttemptEconomicsCardColumn.PayoutRate,
            textOf: (row) => row.payoutRate,
        },
        {
            align: DataTableAlign.End,
            header: 'Payouts per paid funded',
            id: AttemptEconomicsCardColumn.PayoutsPerPaidFunded,
            textOf: (row) => row.payoutsPerPaidFunded,
        },
        {
            align: DataTableAlign.End,
            header: 'Average payout',
            id: AttemptEconomicsCardColumn.AveragePayout,
            textOf: (row) => row.averagePayout,
        },
        {
            align: DataTableAlign.End,
            header: 'Funded value',
            id: AttemptEconomicsCardColumn.FundedValue,
            textOf: (row) => row.fundedValue,
        },
        {
            align: DataTableAlign.End,
            header: 'Funded value / attempt cost',
            id: AttemptEconomicsCardColumn.FundedValueAttemptCost,
            textOf: (row) => row.fundedValueToAttemptCost,
        },
        {
            align: DataTableAlign.End,
            header: 'Breakeven pass rate',
            id: AttemptEconomicsCardColumn.BreakevenPassRate,
            textOf: (row) => row.breakevenPassRate,
        },
        {
            align: DataTableAlign.End,
            header: 'Realized EV per attempt',
            id: AttemptEconomicsCardColumn.RealizedEVPerAttempt,
            textOf: (row) => row.realizedEvPerAttempt,
        },
        {
            align: DataTableAlign.End,
            className: MODELED_CLASS,
            header: 'Modeled EV per attempt',
            id: AttemptEconomicsCardColumn.ModeledEVPerAttempt,
            textOf: (row) => row.modeledEvPerAttempt,
        },
        {
            align: DataTableAlign.End,
            className: MODELED_CLASS,
            header: 'Modeled pass rate',
            id: AttemptEconomicsCardColumn.ModeledPassRate,
            textOf: (row) => row.modeledPassRate,
        },
        {
            align: DataTableAlign.End,
            className: MODELED_CLASS,
            header: 'Modeled payout rate',
            id: AttemptEconomicsCardColumn.ModeledPayoutRate,
            textOf: (row) => row.modeledPayoutRate,
        },
        {
            align: DataTableAlign.End,
            className: MODELED_CLASS,
            header: 'Modeled payouts per paid funded',
            id: AttemptEconomicsCardColumn.ModeledPayoutsPerPaidFunded,
            textOf: (row) => row.modeledPayoutsPerPaidFunded,
        },
        {
            align: DataTableAlign.End,
            className: MODELED_CLASS,
            header: 'Modeled funded value',
            id: AttemptEconomicsCardColumn.ModeledFundedValue,
            textOf: (row) => row.modeledFundedValue,
        },
        {
            align: DataTableAlign.End,
            header: 'Margin above breakeven',
            id: AttemptEconomicsCardColumn.MarginAboveBreakeven,
            textOf: (row) => row.marginAboveBreakeven,
        },
    ];

export const AttemptEconomicsCard = memo(function AttemptEconomicsCard({
    model,
}: {
    readonly model: AttemptEconomicsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewEmptyPanel
                icon={Calculator}
                section={OverviewSectionId.AttemptEconomics}
                title="No account with a modeled plan yet"
            />
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
                            .filter((row) => hasFigure(row.formula))
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
                columns={figureColumns(ATTEMPT_ECONOMICS_COLUMNS, model.rows)}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </OverviewPanel>
    );
});
