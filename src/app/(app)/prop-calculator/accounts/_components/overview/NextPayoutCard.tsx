import { CalendarClock } from 'lucide-react';
import { memo } from 'react';

import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import {
    PENDING_FIGURE,
    UNAVAILABLE_FIGURE,
} from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '~/components/ui/accordion';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';

import { AccountFromStateDetails } from './AccountFromStateDetails';
import {
    type AccountFromStateModel,
    AccountFromStateViewKind,
} from './accountFromStateModel';
import {
    type NextPayoutCardModel,
    type NextPayoutCardRow,
} from './overviewModel';
import {
    infoLinesOf,
    OverviewEmptyPanel,
    OverviewPanel,
} from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

const NOT_FUNDED_TEXT = 'Not funded yet';

export const NextPayoutCard = memo(function NextPayoutCard({
    model,
}: {
    readonly model: NextPayoutCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewEmptyPanel
                action={<EnterBalancesButton />}
                description={model.statusNote ?? undefined}
                icon={CalendarClock}
                section={OverviewSectionId.NextPayout}
                title="Enter balances to see the next payout"
            />
        );
    }
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            isComputing={model.rows.some(
                (row) => row.view.kind === AccountFromStateViewKind.Pending,
            )}
            section={OverviewSectionId.NextPayout}
        >
            <DataTable
                columns={NEXT_PAYOUT_COLUMNS}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.accountId}
            />
            <Accordion type="multiple">
                {model.rows.map((row) => (
                    <NextPayoutRowNotes key={row.accountId} row={row} />
                ))}
            </Accordion>
        </OverviewPanel>
    );
});

enum NextPayoutColumn {
    Account = 'account',
    CreditFree = 'credit-free',
    CreditInclusive = 'credit-inclusive',
    Lost = 'lost',
    Plan = 'plan',
    Time = 'time',
}

function cellsOf(row: NextPayoutCardRow): {
    readonly creditFree: string;
    readonly creditInclusive: string;
    readonly lost: string;
    readonly time: string;
} {
    const { view } = row;
    switch (view.kind) {
        case AccountFromStateViewKind.Failed:
        case AccountFromStateViewKind.Refused: {
            return {
                creditFree: UNAVAILABLE_FIGURE,
                creditInclusive: UNAVAILABLE_FIGURE,
                lost: UNAVAILABLE_FIGURE,
                time: UNAVAILABLE_FIGURE,
            };
        }
        case AccountFromStateViewKind.Pending: {
            return {
                creditFree: PENDING_FIGURE,
                creditInclusive: PENDING_FIGURE,
                lost: PENDING_FIGURE,
                time: PENDING_FIGURE,
            };
        }
        case AccountFromStateViewKind.Ready: {
            return readyCellsOf(view.model);
        }
    }
}

function NextPayoutRowNotes({ row }: { readonly row: NextPayoutCardRow }) {
    const { view } = row;
    switch (view.kind) {
        case AccountFromStateViewKind.Failed:
        case AccountFromStateViewKind.Refused: {
            return (
                <SimulationFailureNotice
                    message={`${row.label}: ${view.reason}`}
                />
            );
        }
        case AccountFromStateViewKind.Pending: {
            return null;
        }
        case AccountFromStateViewKind.Ready: {
            return (
                <AccordionItem value={row.accountId}>
                    <AccordionTrigger>
                        {row.label}: figures from its own state
                    </AccordionTrigger>
                    <AccordionContent>
                        <AccountFromStateDetails model={view.model} />
                    </AccordionContent>
                </AccordionItem>
            );
        }
    }
}

const NEXT_PAYOUT_COLUMNS: DataTableColumn<NextPayoutCardRow>[] = [
    {
        cell: ({ row: { original: row } }) => row.label,
        header: 'Account',
        id: NextPayoutColumn.Account,
        meta: { isRowHeader: true },
    },
    {
        cell: ({ row: { original: row } }) => row.plan,
        header: 'Plan',
        id: NextPayoutColumn.Plan,
    },
    {
        cell: ({ row }) => (
            <FigureText text={cellsOf(row.original).creditFree} />
        ),
        header: 'Value from this state, credit-free',
        id: NextPayoutColumn.CreditFree,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row }) => (
            <FigureText text={cellsOf(row.original).creditInclusive} />
        ),
        header: 'Value with end-of-horizon credit',
        id: NextPayoutColumn.CreditInclusive,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row }) => <FigureText text={cellsOf(row.original).time} />,
        header: 'Expected time to the next payout',
        id: NextPayoutColumn.Time,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row }) => <FigureText text={cellsOf(row.original).lost} />,
        header: 'Chance the account is lost first',
        id: NextPayoutColumn.Lost,
        meta: { align: DataTableAlign.End },
    },
];

function readyCellsOf(model: AccountFromStateModel) {
    return {
        creditFree: model.value.creditFree,
        creditInclusive: model.value.creditInclusive,
        lost: model.nextPayout?.accountLostBeforePayout ?? NOT_FUNDED_TEXT,
        time: model.nextPayout?.calendarDays ?? NOT_FUNDED_TEXT,
    };
}
