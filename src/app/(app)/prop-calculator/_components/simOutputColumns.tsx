import { type DataTableColumn } from '~/components/ui/data-table';
import { formatDays, formatOptionalPercent } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';

import { NO_COST_ROI_REASON, NO_PASS_DAYS_REASON } from './missingReasons';
import { ValueOrMissing } from './ValueOrMissing';

export function passDaysColumn<Row extends { out: SimOutputs }>(
    header = 'Days',
): DataTableColumn<Row> {
    return {
        accessorFn: (r) => r.out.daysToPassP50,
        cell: ({ row }) => (
            <ValueOrMissing
                reason={NO_PASS_DAYS_REASON}
                value={formatDays(row.original.out.daysToPassP50)}
            />
        ),
        header,
        id: 'days',
    };
}

export function roiColumn<
    Row extends { out: SimOutputs },
>(): DataTableColumn<Row> {
    return {
        accessorFn: (r) => r.out.roiOnCost.value ?? undefined,
        cell: ({ row }) => (
            <ValueOrMissing
                reason={NO_COST_ROI_REASON}
                value={formatOptionalPercent(row.original.out.roiOnCost.value)}
            />
        ),
        header: 'ROI',
        id: 'roi',
        sortUndefined: 'last',
    };
}
