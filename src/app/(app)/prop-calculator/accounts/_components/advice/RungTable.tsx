import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { formatCurrency } from '~/lib/format';

enum RungColumn {
    CappedBy = 'capped-by',
    Risk = 'risk',
    RunningLossAfter = 'running-loss-after',
    TakeProfit = 'take-profit',
    Trade = 'trade',
}

export interface RungTableRow {
    readonly cappedByText: readonly string[];
    readonly risk: number;
    readonly runningLossAfter: number;
    readonly takeProfit: number;
}

const CURRENCY_DECIMALS = 2;

const RUNG_COLUMNS: DataTableColumn<RungTableRow>[] = [
    {
        cell: ({ row }) => row.index + 1,
        header: 'Trade',
        id: RungColumn.Trade,
        meta: { isRowHeader: true },
    },
    {
        cell: ({ row: { original: rung } }) =>
            formatCurrency(rung.risk, CURRENCY_DECIMALS),
        header: 'Risk',
        id: RungColumn.Risk,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: rung } }) =>
            formatCurrency(rung.takeProfit, CURRENCY_DECIMALS),
        header: 'Take profit',
        id: RungColumn.TakeProfit,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: rung } }) =>
            formatCurrency(rung.runningLossAfter, CURRENCY_DECIMALS),
        header: 'Running loss after',
        id: RungColumn.RunningLossAfter,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: rung } }) => rung.cappedByText.join(', '),
        header: 'Capped by',
        id: RungColumn.CappedBy,
    },
];

export function RungTable({
    label,
    rungs,
}: {
    readonly label: string;
    readonly rungs: readonly RungTableRow[];
}) {
    return (
        <DataTable
            caption={label}
            columns={RUNG_COLUMNS}
            data={[...rungs]}
            isSortable={false}
            pageSize={null}
        />
    );
}
