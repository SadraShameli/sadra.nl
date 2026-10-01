import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { AccountFromStateDetails } from './AccountFromStateDetails';
import {
    type AccountFromStateModel,
    AccountFromStateViewKind,
} from './accountFromStateModel';
import { type NextPayoutCardModel, type NextPayoutCardRow } from './overviewModel';

const NOT_AVAILABLE_TEXT = 'Not available';
const NOT_FUNDED_TEXT = 'Not funded yet';
const PENDING_TEXT = 'Pending';

export function NextPayoutCard({
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">
                            Value from this state, credit-free
                        </TableHead>
                        <TableHead className="text-right">
                            Value with end-of-horizon credit
                        </TableHead>
                        <TableHead className="text-right">
                            Expected time to the next payout
                        </TableHead>
                        <TableHead className="text-right">
                            Chance the account is lost first
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <NextPayoutTableRow key={row.accountId} row={row} />
                    ))}
                </TableBody>
            </Table>
            {model.rows.map((row) => (
                <NextPayoutRowNotes key={row.accountId} row={row} />
            ))}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
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
                <details className="flex flex-col gap-2">
                    <summary className="cursor-pointer text-sm font-medium text-white">
                        {row.label}: figures from its own state
                    </summary>
                    <div className="mt-2">
                        <AccountFromStateDetails model={view.model} />
                    </div>
                </details>
            );
        }
    }
}

function NextPayoutTableRow({ row }: { readonly row: NextPayoutCardRow }) {
    const cells = cellsOf(row);
    return (
        <TableRow>
            <TableCell>{row.label}</TableCell>
            <TableCell>{row.plan}</TableCell>
            <TableCell className="text-right tabular-nums">
                {cells.creditFree}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {cells.creditInclusive}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {cells.time}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {cells.lost}
            </TableCell>
        </TableRow>
    );
}

function readyCellsOf(model: AccountFromStateModel) {
    return {
        creditFree: model.value.creditFree,
        creditInclusive: model.value.creditInclusive,
        lost: model.nextPayout?.accountLostBeforePayout ?? NOT_FUNDED_TEXT,
        time: model.nextPayout?.calendarDays ?? NOT_FUNDED_TEXT,
    };
}
