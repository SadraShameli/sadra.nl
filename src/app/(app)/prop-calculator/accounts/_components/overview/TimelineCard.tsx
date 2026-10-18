import { History } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayDate } from '~/lib/format';

import { type TimelineCardModel } from './overviewModel';
import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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
            <OverviewEmptyPanel
                icon={History}
                section={OverviewSectionId.Timeline}
                title="No fee, payout or event recorded yet"
            />
        );
    }
    return (
        <OverviewPanel
            info="Cash you received shows as positive and cash you spent as negative. A payout that is not paid moved no cash."
            section={OverviewSectionId.Timeline}
        >
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => (
                            <span className="tabular-nums">
                                {formatDisplayDate(row.original.on)}
                            </span>
                        ),
                        header: 'Date',
                        id: TimelineCardColumn.Date,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText text={row.original.account} />
                        ),
                        header: 'Account',
                        id: TimelineCardColumn.Account,
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText text={row.original.description} />
                        ),
                        header: 'Entry',
                        id: TimelineCardColumn.Entry,
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText text={row.original.amount ?? ''} />
                        ),
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
            {model.hiddenEntries > 0 && (
                <p className="text-xs text-muted-foreground">
                    Showing the newest {model.entries.length} entries;{' '}
                    {model.hiddenEntries} older{' '}
                    {model.hiddenEntries === 1 ? 'entry is' : 'entries are'} not
                    shown here.
                </p>
            )}
        </OverviewPanel>
    );
});
