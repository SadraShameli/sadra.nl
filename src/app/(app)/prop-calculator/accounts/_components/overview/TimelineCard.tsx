import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type TimelineCardModel } from './overviewModel';

enum TimelineCardColumn {
    Account = 'account',
    Cash = 'cash',
    Date = 'date',
    Entry = 'entry',
}

export const TimelineCard = memo(function TimelineCard({
    model,
}: {
    readonly model: TimelineCardModel;
}) {
    if (model.entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No fee, payout or event recorded yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => (
                            <span className="tabular-nums">
                                {row.original.on}
                            </span>
                        ),
                        header: 'Date',
                        id: TimelineCardColumn.Date,
                    },
                    {
                        cell: ({ row }) => <>{row.original.account}</>,
                        header: 'Account',
                        id: TimelineCardColumn.Account,
                    },
                    {
                        cell: ({ row }) => <>{row.original.description}</>,
                        header: 'Entry',
                        id: TimelineCardColumn.Entry,
                    },
                    {
                        cell: ({ row }) => <>{row.original.amount}</>,
                        header: 'Cash',
                        id: TimelineCardColumn.Cash,
                        meta: { align: DataTableAlign.End },
                    },
                ]}
                data={[...model.entries]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
            <p className="text-xs text-muted-foreground">
                Cash you received shows as positive and cash you spent as
                negative. A payout that is not paid moved no cash.
            </p>
            {model.hiddenEntries > 0 && (
                <p className="text-xs text-muted-foreground">
                    Showing the newest {model.entries.length} entries;{' '}
                    {model.hiddenEntries} older{' '}
                    {model.hiddenEntries === 1 ? 'entry is' : 'entries are'} not
                    shown here.
                </p>
            )}
        </div>
    );
});
