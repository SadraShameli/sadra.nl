'use client';

import { format } from 'date-fns';
import { ExternalLink, LibraryBig, LogOut, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveColumnFilter,
} from '~/components/ui/DataTable';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type ProgramEnrollment =
    RouterOutputs['lifting']['program']['listMine']['enrollments'][number];
type ProgramOwned =
    RouterOutputs['lifting']['program']['listMine']['owned'][number];

const FILTER_ALL = '__all__';

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
                        className="font-medium text-white hover:underline"
                        href={routes.lifting.program(row.original.slug)}
                    >
                        {row.original.name}
                    </Link>
                ),
                header: 'Name',
            },
            {
                accessorKey: 'category',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.category}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Category',
            },
            {
                accessorKey: 'daysPerWeek',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.daysPerWeek} ×/wk ·{' '}
                        {row.original.lengthWeeks} wk
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Structure',
            },
            {
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            aria-label="Open program"
                            asChild
                            size="sm"
                            variant="outline"
                        >
                            <Link
                                href={routes.lifting.program(row.original.slug)}
                            >
                                <ExternalLink className="size-3.5" />
                            </Link>
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    aria-label="Delete program"
                                    size="sm"
                                    variant="outline"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete &ldquo;{row.original.name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Your enrollments in this program will
                                        also be removed.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            customProgramDeleteMutation.mutate({
                                                id: row.original.id,
                                            })
                                        }
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ),
                enableSorting: false,
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [customProgramDeleteMutation],
    );

    const enrollmentColumns = useMemo<DataTableColumn<ProgramEnrollment>[]>(
        () => [
            {
                accessorKey: 'programId',
                cell: ({ row }) => (
                    <span className="font-medium text-white">
                        {programNameById.get(row.original.programId) ??
                            'Program'}
                    </span>
                ),
                header: 'Program',
            },
            {
                accessorKey: 'status',
                cell: ({ row }) => (
                    <Badge variant="secondary">{row.original.status}</Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
            },
            {
                accessorFn: (r) => `${r.currentWeek}-${r.currentDay}`,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        wk {row.original.currentWeek} · day{' '}
                        {row.original.currentDay}
                    </span>
                ),
                header: 'Position',
                id: 'position',
            },
            {
                accessorFn: (r) => {
                    const d = toDate(r.startDate);
                    return d ? d.getTime() : 0;
                },
                cell: ({ row }) => {
                    const d = toDate(row.original.startDate);
                    return (
                        <span className="text-xs text-muted-foreground">
                            {d ? format(d, 'MMM d, y') : '—'}
                        </span>
                    );
                },
                header: 'Started',
                id: 'startDate',
            },
            {
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    aria-label="Unenroll"
                                    size="sm"
                                    variant="outline"
                                >
                                    <LogOut className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Unenroll?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Removes your enrollment. Past workouts
                                        stay intact. You can re-enroll any time.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            unenroll.mutate({
                                                id: row.original.id,
                                            })
                                        }
                                    >
                                        Unenroll
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ),
                enableSorting: false,
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [programNameById, unenroll],
    );

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            Custom programs
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Programs you&apos;ve created. Use the programs page
                            to build new ones — the structure is multi-week and
                            doesn&apos;t fit in a simple dialog.
                        </p>
                    </div>
                    <Button asChild className="gap-1" size="sm">
                        <Link href={routes.lifting.programs}>
                            <ExternalLink className="size-4" /> Open programs
                            page
                        </Link>
                    </Button>
                </div>
                <DataTable
                    belowFilter={(table) => (
                        <ClearFiltersButton
                            active={hasActiveColumnFilter(table)}
                            onReset={() => table.resetColumnFilters()}
                        />
                    )}
                    columns={ownedColumns}
                    data={ownedRows}
                    emptyState={(table) => (
                        <EmptyState
                            description={
                                hasActiveColumnFilter(table)
                                    ? 'No programs match these filters.'
                                    : 'Build one from the programs page, or duplicate an official program to customize.'
                            }
                            icon={LibraryBig}
                            title={
                                hasActiveColumnFilter(table)
                                    ? 'No matches'
                                    : 'No custom programs'
                            }
                        />
                    )}
                    filterPlaceholder="Search programs…"
                    filterPosition="bottom"
                    headerActions={(table) => {
                        const daysColumn = table.getColumn('daysPerWeek');
                        if (!daysColumn) return null;
                        const daysOptions = (
                            [...daysColumn.getFacetedUniqueValues()] as [
                                number,
                                number,
                            ][]
                        ).toSorted(([a], [b]) => a - b);
                        return (
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                        Category
                                    </span>
                                    <DataTableFacetSelect
                                        className="w-40"
                                        column={table.getColumn('category')}
                                        format={(value) => (
                                            <span className="capitalize">
                                                {value}
                                            </span>
                                        )}
                                        placeholder="All categories"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                        Frequency
                                    </span>
                                    <Select
                                        onValueChange={(v) =>
                                            daysColumn.setFilterValue(
                                                v === FILTER_ALL
                                                    ? undefined
                                                    : Number(v),
                                            )
                                        }
                                        value={
                                            daysColumn.getFilterValue() ===
                                            undefined
                                                ? FILTER_ALL
                                                : String(
                                                      daysColumn.getFilterValue(),
                                                  )
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={FILTER_ALL}>
                                                Any frequency
                                            </SelectItem>
                                            {daysOptions.map(
                                                ([days, count]) => (
                                                    <SelectItem
                                                        key={days}
                                                        value={String(days)}
                                                    >
                                                        {days}× / week ({count})
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        );
                    }}
                    isLoading={mine.isLoading}
                    rowId={(r) => r.id}
                    showFilter
                />
            </section>

            <section className="flex flex-col gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">
                        Enrollments
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Programs you&apos;re currently following.
                    </p>
                </div>
                <DataTable
                    belowFilter={(table) => (
                        <ClearFiltersButton
                            active={hasActiveColumnFilter(table)}
                            onReset={() => table.resetColumnFilters()}
                        />
                    )}
                    columns={enrollmentColumns}
                    data={enrollments}
                    emptyState={(table) => (
                        <EmptyState
                            description={
                                hasActiveColumnFilter(table)
                                    ? 'No enrollments match this filter.'
                                    : 'Enroll in a program from the programs page.'
                            }
                            icon={LibraryBig}
                            title={
                                hasActiveColumnFilter(table)
                                    ? 'No matches'
                                    : 'No active enrollments'
                            }
                        />
                    )}
                    filterPlaceholder="Search enrollments…"
                    filterPosition="bottom"
                    headerActions={(table) => (
                        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                    Status
                                </span>
                                <DataTableFacetSelect
                                    className="w-36"
                                    column={table.getColumn('status')}
                                    format={(value) => (
                                        <span className="capitalize">
                                            {value}
                                        </span>
                                    )}
                                    placeholder="All statuses"
                                />
                            </div>
                        </div>
                    )}
                    isLoading={mine.isLoading}
                    rowId={(r) => r.id}
                    showFilter
                />
            </section>
        </div>
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
