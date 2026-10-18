import { memo } from 'react';

import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
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

const NOT_AVAILABLE_TEXT = 'Not available';
const NOT_FUNDED_TEXT = 'Not funded yet';
const PENDING_TEXT = 'Pending';

export const NextPayoutCard = memo(function NextPayoutCard({
    model,
}: {
    readonly model: NextPayoutCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {model.statusNote ?? 'No account to project yet.'}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-4">
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
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
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
                creditFree: NOT_AVAILABLE_TEXT,
                creditInclusive: NOT_AVAILABLE_TEXT,
                lost: NOT_AVAILABLE_TEXT,
                time: NOT_AVAILABLE_TEXT,
            };
        }
        case AccountFromStateViewKind.Pending: {
            return {
                creditFree: PENDING_TEXT,
                creditInclusive: PENDING_TEXT,
                lost: PENDING_TEXT,
                time: PENDING_TEXT,
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
    },
    {
        cell: ({ row: { original: row } }) => row.plan,
        header: 'Plan',
        id: NextPayoutColumn.Plan,
    },
    {
        cell: ({ row: { original: row } }) => cellsOf(row).creditFree,
        header: 'Value from this state, credit-free',
        id: NextPayoutColumn.CreditFree,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: row } }) => cellsOf(row).creditInclusive,
        header: 'Value with end-of-horizon credit',
        id: NextPayoutColumn.CreditInclusive,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: row } }) => cellsOf(row).time,
        header: 'Expected time to the next payout',
        id: NextPayoutColumn.Time,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: row } }) => cellsOf(row).lost,
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
