'use client';

import { ExternalLink, LibraryBig, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
    MutedCell,
    PrimaryCell,
    ProfileCollectionEmpty,
    ProfileDateCell,
    ProfileDatePrecision,
} from '~/app/(app)/profile/_components/ProfileTable';
import { NoMatchesState } from '~/components/ui/empty-state';
import {
    deleteRowAction,
    linkRowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    type DataTableInstance,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { FilterSelect } from '~/components/ui/filter-select';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type ProgramEnrollment =
    RouterOutputs['lifting']['program']['listMine']['enrollments'][number];
type ProgramOwned =
    RouterOutputs['lifting']['program']['listMine']['owned'][number];

const ProgramColumn = {
    Category: 'category',
    DaysPerWeek: 'daysPerWeek',
    Status: 'status',
} as const;

export function ProgramsManager() {
    const utilities = api.useUtils();
    const mine = api.lifting.program.listMine.useQuery();
    const official = api.lifting.program.listOfficial.useQuery();

    const customProgramDeleteMutation =
        api.lifting.program.deleteCustom.useMutation({
            onError: (error) => toast.error(error.message),
            onSuccess: async () => {
                toast.success('Custom program deleted');
                await utilities.lifting.program.listMine.invalidate();
            },
        });
    const unenroll = api.lifting.program.unenroll.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unenrolled');
            await utilities.lifting.program.listMine.invalidate();
        },
    });

    const ownedRows = useMemo(() => mine.data?.owned ?? [], [mine.data]);
    const enrollments = useMemo(
        () => mine.data?.enrollments ?? [],
        [mine.data],
    );

    const programNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of ownedRows) map.set(p.id, p.name);
        const officialPrograms = official.data ?? [];
        for (const p of officialPrograms) map.set(p.id, p.name);
        return map;
    }, [ownedRows, official.data]);

    const ownedColumns = useMemo<DataTableColumn<ProgramOwned>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="hover:underline"
                        href={routes.lifting.program(row.original.slug)}
                    >
                        <PrimaryCell>{row.original.name}</PrimaryCell>
                    </Link>
                ),
                header: 'Name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: ProgramColumn.Category,
                cell: ({ row }) => (
                    <MutedCell className="capitalize">
                        {row.original.category}
                    </MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Category',
            },
            {
                accessorKey: ProgramColumn.DaysPerWeek,
                cell: ({ row }) => (
                    <MutedCell>
                        {row.original.daysPerWeek} ×/wk ·{' '}
                        {row.original.lengthWeeks} wk
                    </MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Structure',
            },
            rowActionsColumn<ProgramOwned>({
                actionsOf: (program) => [
                    linkRowAction({
                        href: routes.lifting.program(program.slug),
                        icon: ExternalLink,
                        label: 'Open',
                    }),
                    deleteRowAction({
                        description:
                            'Your enrollments in this program will also be removed.',
                        onDelete: () =>
                            customProgramDeleteMutation.mutate({
                                id: program.id,
                            }),
                        title: `Delete “${program.name}”?`,
                    }),
                ],
                isPendingOf: (program) =>
                    customProgramDeleteMutation.isPending &&
                    customProgramDeleteMutation.variables.id === program.id,
                labelOf: (program) => program.name,
            }),
        ],
        [customProgramDeleteMutation],
    );

    const enrollmentColumns = useMemo<
        DataTableColumn<ProgramEnrollment>[]
    >(() => {
        const programNameOf = (enrollment: ProgramEnrollment): string =>
            programNameById.get(enrollment.programId) ?? 'Program';
        return [
            {
                accessorKey: 'programId',
                cell: ({ row }) => (
                    <PrimaryCell>{programNameOf(row.original)}</PrimaryCell>
                ),
                header: 'Program',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: ProgramColumn.Status,
                cell: ({ row }) => (
                    <Badge className="capitalize">{row.original.status}</Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
            },
            {
                accessorFn: (r) => `${r.currentWeek}-${r.currentDay}`,
                cell: ({ row }) => (
                    <MutedCell>
                        wk {row.original.currentWeek} · day{' '}
                        {row.original.currentDay}
                    </MutedCell>
                ),
                header: 'Position',
                id: 'position',
            },
            {
                accessorFn: (r) => toDate(r.startDate)?.getTime() ?? 0,
                cell: ({ row }) => (
                    <ProfileDateCell
                        precision={ProfileDatePrecision.Day}
                        value={toDate(row.original.startDate)}
                    />
                ),
                header: 'Started',
                id: 'startDate',
            },
            rowActionsColumn<ProgramEnrollment>({
                actionsOf: (enrollment) => [
                    {
                        confirm: {
                            confirmLabel: 'Unenroll',
                            description:
                                'Removes your enrollment. Past workouts stay intact. You can re-enroll any time.',
                            title: 'Unenroll?',
                        },
                        icon: LogOut,
                        isDestructive: true,
                        kind: RowActionKind.Select,
                        label: 'Unenroll',
                        onSelect: () => unenroll.mutate({ id: enrollment.id }),
                    },
                ],
                isPendingOf: (enrollment) =>
                    unenroll.isPending &&
                    unenroll.variables.id === enrollment.id,
                labelOf: programNameOf,
            }),
        ];
    }, [programNameById, unenroll]);

    return (
        <div className="flex flex-col gap-6">
            <ToolPanel
                actions={
                    <Button asChild size="sm">
                        <Link href={routes.lifting.programs}>
                            <ExternalLink className="size-4" />
                            Programs page
                        </Link>
                    </Button>
                }
                description="Programs you created. Build and edit them on the programs page."
                title="Custom programs"
            >
                {!mine.isLoading && ownedRows.length === 0 ? (
                    <ProfileCollectionEmpty
                        description="Build one on the programs page, or duplicate an official program to customize it."
                        icon={LibraryBig}
                        noun="custom programs"
                    />
                ) : (
                    <DataTable
                        columns={ownedColumns}
                        data={ownedRows}
                        emptyState={
                            <NoMatchesState
                                icon={LibraryBig}
                                noun="custom programs"
                            />
                        }
                        filterPlaceholder="Search programs…"
                        headerActions={(table) => (
                            <>
                                <DataTableFacetSelect
                                    column={table.getColumn(
                                        ProgramColumn.Category,
                                    )}
                                    format={(value) => (
                                        <span className="capitalize">
                                            {value}
                                        </span>
                                    )}
                                    label="Category"
                                    placeholder="All categories"
                                />
                                <FrequencySelect table={table} />
                            </>
                        )}
                        isLoading={mine.isLoading}
                        rowId={(r) => r.id}
                        showFilter
                    />
                )}
            </ToolPanel>

            <ToolPanel
                description="Programs you are currently following."
                title="Enrollments"
            >
                {!mine.isLoading && enrollments.length === 0 ? (
                    <ProfileCollectionEmpty
                        description="Enroll in a program from the programs page."
                        icon={LibraryBig}
                        noun="enrollments"
                    />
                ) : (
                    <DataTable
                        columns={enrollmentColumns}
                        data={enrollments}
                        emptyState={
                            <NoMatchesState
                                icon={LibraryBig}
                                noun="enrollments"
                            />
                        }
                        filterPlaceholder="Search enrollments…"
                        headerActions={(table) => (
                            <DataTableFacetSelect
                                column={table.getColumn(ProgramColumn.Status)}
                                format={(value) => (
                                    <span className="capitalize">{value}</span>
                                )}
                                label="Status"
                                placeholder="All statuses"
                            />
                        )}
                        isLoading={mine.isLoading}
                        rowId={(r) => r.id}
                        showFilter
                    />
                )}
            </ToolPanel>
        </div>
    );
}

function FrequencySelect({
    table,
}: {
    table: DataTableInstance<ProgramOwned>;
}) {
    const column = table.getColumn(ProgramColumn.DaysPerWeek);
    if (!column) return null;
    const options = [...column.getFacetedUniqueValues()]
        .filter(
            (entry): entry is [number, number] => typeof entry[0] === 'number',
        )
        .toSorted(([a], [b]) => a - b)
        .map(([days, count]) => ({
            count,
            label: `${String(days)}× / week`,
            value: String(days),
        }));
    const current = column.getFilterValue();
    return (
        <FilterSelect
            label="Frequency"
            onValueChange={(value) =>
                column.setFilterValue(
                    value === undefined ? undefined : Number(value),
                )
            }
            options={options}
            placeholder="Any frequency"
            value={typeof current === 'number' ? String(current) : undefined}
        />
    );
}

function toDate(raw: unknown): Date | null {
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : raw;
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}
