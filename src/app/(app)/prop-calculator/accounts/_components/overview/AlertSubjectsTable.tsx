'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '~/components/ui/data-table';

import { type OverviewAlert } from './overviewModel';

const ALERT_SUBJECTS_PAGE_SIZE = 5;

enum AlertSubjectColumn {
    Detail = 'detail',
    Subject = 'subject',
}

const ALERT_SUBJECT_COLUMNS: DataTableColumn<OverviewAlert>[] = [
    {
        accessorFn: (row) => row.subjectLabel,
        cell: ({ row }) => <AlertSubjectLabel alert={row.original} />,
        header: 'Account',
        id: AlertSubjectColumn.Subject,
    },
    {
        accessorFn: (row) => row.message,
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.message}
            </span>
        ),
        header: 'Detail',
        id: AlertSubjectColumn.Detail,
    },
];

export function AlertSubjectLabel({
    alert,
}: {
    readonly alert: OverviewAlert;
}) {
    return alert.href === null ? (
        <span className="font-medium">{alert.subjectLabel}</span>
    ) : (
        <Link
            className="font-medium underline-offset-4 hover:underline"
            href={alert.href}
        >
            {alert.subjectLabel}
        </Link>
    );
}

export function AlertSubjectsTable({
    alerts,
}: {
    readonly alerts: readonly OverviewAlert[];
}) {
    return (
        <DataTable<OverviewAlert>
            columns={ALERT_SUBJECT_COLUMNS}
            data={[...alerts]}
            filterPlaceholder="Search accounts"
            initialSorting={[{ desc: false, id: AlertSubjectColumn.Subject }]}
            pageSize={ALERT_SUBJECTS_PAGE_SIZE}
            rowId={(row) => row.key}
            showFilter={alerts.length > ALERT_SUBJECTS_PAGE_SIZE}
        />
    );
}
