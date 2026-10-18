'use client';

import {
    ArrowRight,
    Calendar,
    Check,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    LibraryBig,
    LineChart,
    LogOut,
    Pause,
    Play,
    Search,
    Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FilterToolbar } from '~/components/FilterToolbar';
import { TitledCardSkeleton } from '~/components/PageSkeleton';
import { PanelSubheading } from '~/components/PanelSubheading';
import {
    deleteRowAction,
    linkRowAction,
    type RowAction,
    RowActionKind,
    RowActionsMenu,
    type RowSelectAction,
} from '~/components/RowActionsMenu';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { EmptyState, NoMatchesState } from '~/components/ui/empty-state';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { FilterSelect } from '~/components/ui/filter-select';
import { Input } from '~/components/ui/input';
import { Progress } from '~/components/ui/progress';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import {
    PROGRAM_CATEGORY_VALUES,
    type ProgramBlock,
    type ProgramCategory,
    USER_PROGRAM_STATUS,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

type Enrollment =
    RouterOutputs['lifting']['program']['listMine']['enrollments'][number];
type OfficialProgram =
    RouterOutputs['lifting']['program']['listOfficial'][number];
type OwnedProgram =
    RouterOutputs['lifting']['program']['listMine']['owned'][number];
type ProgramReference = OfficialProgram;

const SORT_VALUES = ['name', 'days', 'length'] as const;
type SortKey = (typeof SORT_VALUES)[number];
const SORT_LABEL: Record<SortKey, string> = {
    days: 'Days / week',
    length: 'Length',
    name: 'Name',
};

const DAYS_FILTER_VALUES = ['all', '3', '4', '5', '6'] as const;
type DaysFilter = (typeof DAYS_FILTER_VALUES)[number];

export function ProgramsLibrary({
    officialPrograms,
}: {
    readonly officialPrograms: OfficialProgram[];
}) {
    const official = api.lifting.program.listOfficial.useQuery(undefined, {
        initialData: officialPrograms,
    });
    const mine = api.lifting.program.listMine.useQuery();

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [category, setCategory] = useState<'all' | ProgramCategory>('all');
    const [days, setDays] = useState<DaysFilter>('all');
    const [sort, setSort] = useState<SortKey>('name');

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search), 200);
        return () => clearTimeout(id);
    }, [search]);

    const enrolledProgramIds = useMemo(() => {
        const ids = new Set<string>();
        const enrollments = mine.data?.enrollments ?? [];
        for (const enrollment of enrollments) ids.add(enrollment.programId);
        return ids;
    }, [mine.data?.enrollments]);

    const ownedNames = useMemo(() => {
        const names = new Set<string>();
        const owned = mine.data?.owned ?? [];
        for (const p of owned) names.add(p.name);
        return names;
    }, [mine.data?.owned]);

    const programsById = useMemo(() => {
        const map = new Map<string, ProgramReference>();
        const officialPrograms = official.data;
        const ownedPrograms = mine.data?.owned ?? [];
        for (const p of officialPrograms) map.set(p.id, p);
        for (const p of ownedPrograms) map.set(p.id, p);
        return map;
    }, [official.data, mine.data?.owned]);

    const filtered = useMemo(() => {
        const rows = official.data;
        const q = debouncedSearch.trim().toLowerCase();
        const out = rows.filter((p) => {
            if (
                (category !== 'all' && p.category !== category) ||
                (days !== 'all' && p.daysPerWeek !== Number(days))
            )
                return false;
            if (q) {
                const hay = `${p.name} ${p.category} ${
                    p.description ?? ''
                }`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        out.sort((a, b) => {
            if (sort === 'days') return a.daysPerWeek - b.daysPerWeek;
            return sort === 'length'
                ? a.lengthWeeks - b.lengthWeeks
                : a.name.localeCompare(b.name);
        });
        return out;
    }, [official.data, debouncedSearch, category, days, sort]);

    const activeEnrollments = (mine.data?.enrollments ?? []).filter(
        (enrollment) => enrollment.status === 'active',
    );
    const otherEnrollments = (mine.data?.enrollments ?? []).filter(
        (enrollment) => enrollment.status !== 'active',
    );

    const isFiltersActive =
        search.length > 0 || category !== 'all' || days !== 'all';

    const totalEnrollments = mine.data?.enrollments.length ?? 0;
    const ownedCount = mine.data?.owned.length ?? 0;
    const officialCount = official.data.length;

    return (
        <div className="flex flex-col gap-6">
            <StatStrip
                isLoading={mine.isLoading}
                items={[
                    {
                        id: 'active',
                        label: 'Active',
                        value: activeEnrollments.length.toString(),
                    },
                    {
                        id: 'enrollments',
                        label: 'Enrollments',
                        value: totalEnrollments.toString(),
                    },
                    {
                        id: 'custom',
                        label: 'Custom',
                        value: ownedCount.toString(),
                    },
                    {
                        id: 'available',
                        label: 'Available',
                        value: officialCount.toString(),
                    },
                ]}
            />

            {mine.isLoading ? (
                <TitledCardSkeleton title="Active" />
            ) : (
                activeEnrollments.length > 0 && (
                    <ToolPanel title="Active">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {activeEnrollments.map((enrollment) => (
                                <ActiveEnrollmentCard
                                    enrollment={enrollment}
                                    key={enrollment.id}
                                    program={programsById.get(
                                        enrollment.programId,
                                    )}
                                />
                            ))}
                        </div>
                    </ToolPanel>
                )
            )}

            {(otherEnrollments.length > 0 ||
                (mine.data?.owned.length ?? 0) > 0) && (
                <ToolPanel title="Your library">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {otherEnrollments.map((enrollment) => (
                            <EnrollmentCard
                                enrollment={enrollment}
                                key={enrollment.id}
                                program={programsById.get(enrollment.programId)}
                            />
                        ))}
                        {mine.data?.owned.map((p) => (
                            <OwnedProgramCard key={p.id} program={p} />
                        ))}
                    </div>
                </ToolPanel>
            )}

            <ToolPanel
                contentClassName="gap-4"
                description={
                    <span className="tabular-nums">
                        {filtered.length} of {officialCount} programs
                    </span>
                }
                title="Browse programs"
            >
                <FilterToolbar label="Program filters">
                    <FilterSelect
                        label="Category"
                        onValueChange={(v) =>
                            setCategory(
                                PROGRAM_CATEGORY_VALUES.find((c) => c === v) ??
                                    'all',
                            )
                        }
                        options={PROGRAM_CATEGORY_VALUES.map((c) => ({
                            label: <span className="capitalize">{c}</span>,
                            value: c,
                        }))}
                        placeholder="All categories"
                        value={category === 'all' ? undefined : category}
                    />
                    <FilterSelect
                        label="Frequency"
                        onValueChange={(v) =>
                            setDays(
                                DAYS_FILTER_VALUES.find((d) => d === v) ??
                                    'all',
                            )
                        }
                        options={DAYS_FILTER_VALUES.filter(
                            (d) => d !== 'all',
                        ).map((d) => ({
                            label: `${d}× / week`,
                            value: d,
                        }))}
                        placeholder="Any frequency"
                        value={days === 'all' ? undefined : days}
                    />
                    <ToolbarSelect
                        label="Sort"
                        onValueChange={(v) => {
                            const next = SORT_VALUES.find((key) => key === v);
                            if (next) setSort(next);
                        }}
                        options={SORT_VALUES.map((key) => ({
                            label: SORT_LABEL[key],
                            value: key,
                        }))}
                        value={sort}
                    />
                    <div className="relative w-fit">
                        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-muted" />
                        <Input
                            aria-label="Search programs"
                            className={cn(SEARCH_FIELD_CLASS, 'pl-9')}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search programs"
                            value={search}
                        />
                    </div>
                    <ClearFiltersButton
                        active={isFiltersActive}
                        onReset={() => {
                            setSearch('');
                            setCategory('all');
                            setDays('all');
                        }}
                    />
                </FilterToolbar>

                {filtered.length === 0 &&
                    (isFiltersActive ? (
                        <NoMatchesState icon={Search} noun="programs" />
                    ) : (
                        <EmptyState
                            description="Official programs show up here once they are published."
                            icon={LibraryBig}
                            title="No programs yet"
                        />
                    ))}

                {filtered.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((p) => (
                            <OfficialProgramCard
                                enrolled={enrolledProgramIds.has(p.id)}
                                inLibrary={ownedNames.has(p.name)}
                                key={p.id}
                                program={p}
                            />
                        ))}
                    </div>
                )}
            </ToolPanel>
        </div>
    );
}

function ActiveEnrollmentCard({
    enrollment,
    program,
}: {
    enrollment: Enrollment;
    program: ProgramReference | undefined;
}) {
    const utilities = api.useUtils();
    const [previewOpen, setPreviewOpen] = useState(false);

    const nextDay = api.lifting.program.nextDay.useQuery({ id: enrollment.id });

    const invalidate = () => utilities.lifting.program.listMine.invalidate();

    const advance = api.lifting.program.advance.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Advanced to next day.');
            await Promise.all([
                invalidate(),
                utilities.lifting.program.nextDay.invalidate({
                    id: enrollment.id,
                }),
            ]);
        },
    });

    const updateEnrollment = api.lifting.program.updateEnrollment.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Program paused.');
            await invalidate();
        },
    });

    const unenroll = api.lifting.program.unenroll.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unenrolled.');
            await invalidate();
        },
    });

    const totalDays =
        program?.schedule.weeks.reduce(
            (accumulator, w) => accumulator + w.days.length,
            0,
        ) ?? 0;
    const completedDays = program
        ? program.schedule.weeks
              .slice(0, enrollment.currentWeek - 1)
              .reduce((accumulator, w) => accumulator + w.days.length, 0) +
          (enrollment.currentDay - 1)
        : 0;
    const pct = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;

    const isCompleted = enrollment.status === USER_PROGRAM_STATUS.COMPLETED;
    const upcomingDay = nextDay.data?.day ?? null;

    return (
        <Card className="py-4">
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                        <Badge className="w-fit">Active</Badge>
                        <PanelSubheading className="text-lg font-semibold">
                            <ProgramTitle
                                fallback={programName(program)}
                                program={program}
                            />
                        </PanelSubheading>
                        <p className="text-xs text-muted-foreground tabular-nums">
                            Week {enrollment.currentWeek} of{' '}
                            {program?.lengthWeeks ?? '-'} · Day{' '}
                            {enrollment.currentDay}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <RowActionsMenu
                            actions={[
                                ...openProgramActions(program),
                                {
                                    icon: Pause,
                                    isDisabled: updateEnrollment.isPending,
                                    kind: RowActionKind.Select,
                                    label: 'Pause',
                                    onSelect: () =>
                                        updateEnrollment.mutate({
                                            id: enrollment.id,
                                            status: USER_PROGRAM_STATUS.PAUSED,
                                        }),
                                },
                                unenrollAction(program, () =>
                                    unenroll.mutate({ id: enrollment.id }),
                                ),
                            ]}
                            isPending={unenroll.isPending}
                            label={programName(program)}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                        <span>Progress</span>
                        <span>
                            {completedDays} / {totalDays} days ·{' '}
                            {Math.round(pct)}%
                        </span>
                    </div>
                    <Progress value={pct} />
                </div>

                <Button
                    aria-expanded={previewOpen}
                    className="self-start"
                    onClick={() => setPreviewOpen((o) => !o)}
                    size="sm"
                    type="button"
                    variant="ghost"
                >
                    {previewOpen ? (
                        <ChevronUp data-icon="inline-start" />
                    ) : (
                        <ChevronDown data-icon="inline-start" />
                    )}
                    {previewOpen ? 'Hide' : 'Preview'} upcoming session
                </Button>

                {previewOpen && (
                    <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                        {isCompleted ? (
                            <p className="text-xs text-muted-foreground">
                                Program completed: no more sessions.
                            </p>
                        ) : upcomingDay === null ? (
                            <p className="text-xs text-muted-foreground">
                                Rest day: no exercises scheduled.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-xs font-medium">
                                    {upcomingDay.name ||
                                        `Day ${enrollment.currentDay}`}
                                    {upcomingDay.isDeload && (
                                        <span className="ml-1.5 text-muted-foreground">
                                            (deload)
                                        </span>
                                    )}
                                </p>
                                <ul className="flex flex-col gap-0.5">
                                    {upcomingDay.blocks.map((b, index) => (
                                        <li
                                            className="text-xs text-muted-foreground"
                                            key={`${b.kind}-${'exerciseSlug' in b ? b.exerciseSlug : index}`}
                                        >
                                            {blockLabel(b)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <Button
                    className="gap-1.5 self-start"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate({ id: enrollment.id })}
                    size="sm"
                    type="button"
                    variant="outline"
                >
                    <Check className="size-3.5" /> Mark day done
                </Button>
            </CardContent>
        </Card>
    );
}

function blockLabel(block: ProgramBlock): string {
    if (block.kind === 'straight') {
        const rpe = block.rpe === undefined ? '' : ` @ RPE ${block.rpe}`;
        return `${block.sets}×${block.reps} ${block.exerciseSlug.replaceAll('-', ' ')}${rpe}`;
    }
    if (block.kind === 'amrap') {
        return `AMRAP ${block.exerciseSlug.replaceAll('-', ' ')}`;
    }
    if (block.kind === 'topset_backoff') {
        return `${block.exerciseSlug.replaceAll('-', ' ')} top set + ${block.backoffSets}×${block.reps}`;
    }
    if (block.kind === 'pyramid') {
        return `${block.exerciseSlug.replaceAll('-', ' ')} pyramid (${block.setSchemes.length} sets)`;
    }
    return block.kind === 'emom'
        ? `EMOM ${block.minutes}m: ${block.exerciseSlug.replaceAll('-', ' ')}`
        : `Superset (${block.group.length} exercises)`;
}

function EnrollmentCard({
    enrollment,
    program,
}: {
    enrollment: Enrollment;
    program: ProgramReference | undefined;
}) {
    const utilities = api.useUtils();
    const invalidate = () => utilities.lifting.program.listMine.invalidate();
    const resume = api.lifting.program.updateEnrollment.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Resumed.');
            await invalidate();
        },
    });
    const unenroll = api.lifting.program.unenroll.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Removed.');
            await invalidate();
        },
    });

    const status = enrollment.status;
    const total = program?.lengthWeeks ?? 0;
    const pct = total > 0 ? (enrollment.currentWeek / total) * 100 : 0;

    return (
        <Card className="py-4">
            <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <Badge className="capitalize">{status}</Badge>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground tabular-nums">
                            W{enrollment.currentWeek} · D{enrollment.currentDay}
                        </span>
                        <RowActionsMenu
                            actions={[
                                ...openProgramActions(program),
                                ...(status === USER_PROGRAM_STATUS.PAUSED
                                    ? [
                                          {
                                              icon: Play,
                                              isDisabled: resume.isPending,
                                              kind: RowActionKind.Select,
                                              label: 'Resume',
                                              onSelect: () =>
                                                  resume.mutate({
                                                      id: enrollment.id,
                                                      status: USER_PROGRAM_STATUS.ACTIVE,
                                                  }),
                                          } satisfies RowAction,
                                      ]
                                    : []),
                                unenrollAction(program, () =>
                                    unenroll.mutate({ id: enrollment.id }),
                                ),
                            ]}
                            isPending={unenroll.isPending}
                            label={programName(program)}
                        />
                    </div>
                </div>
                <PanelSubheading className="font-semibold">
                    <ProgramTitle fallback="-" program={program} />
                </PanelSubheading>
                <Progress className="h-1.5" value={pct} />
            </CardContent>
        </Card>
    );
}

function OfficialProgramCard({
    enrolled,
    inLibrary,
    program,
}: {
    enrolled: boolean;
    inLibrary: boolean;
    program: OfficialProgram;
}) {
    return (
        <Link
            className="group block"
            href={routes.lifting.program(program.slug)}
        >
            <Card className="h-full gap-2 py-4 transition hover:border-border hover:bg-card">
                <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <LineChart className="size-4 text-muted-foreground" />
                            <PanelSubheading className="text-base font-semibold">
                                {program.name}
                            </PanelSubheading>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <Badge>{program.category}</Badge>
                        <Badge>
                            <Calendar className="mr-1 size-3" />
                            {program.daysPerWeek}× / wk
                        </Badge>
                        <Badge>{program.lengthWeeks} weeks</Badge>
                        {enrolled && (
                            <Badge>
                                <Trophy className="mr-1 size-3" /> Enrolled
                            </Badge>
                        )}
                        {!enrolled && inLibrary && <Badge>In library</Badge>}
                    </div>
                    {program.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                            {program.description}
                        </p>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}

function openProgramActions(
    program: ProgramReference | undefined,
): RowAction[] {
    return program === undefined
        ? []
        : [
              linkRowAction({
                  href: routes.lifting.program(program.slug),
                  icon: ExternalLink,
                  label: 'Open',
              }),
          ];
}

function OwnedProgramCard({ program }: { program: OwnedProgram }) {
    const utilities = api.useUtils();
    const remove = api.lifting.program.deleteCustom.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Custom program deleted.');
            await utilities.lifting.program.listMine.invalidate();
        },
    });
    return (
        <Card className="py-4">
            <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <Badge>Custom</Badge>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {program.daysPerWeek}× · {program.lengthWeeks}w
                        </span>
                        <RowActionsMenu
                            actions={[
                                ...openProgramActions(program),
                                deleteRowAction({
                                    description:
                                        'This is a custom program. Deleting it removes the program and any enrollments.',
                                    onDelete: () =>
                                        remove.mutate({ id: program.id }),
                                    title: `Delete ${program.name}?`,
                                }),
                            ]}
                            isPending={remove.isPending}
                            label={program.name}
                        />
                    </div>
                </div>
                <PanelSubheading className="font-semibold">
                    <ProgramTitle fallback={program.name} program={program} />
                </PanelSubheading>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                    {program.description ?? 'No description.'}
                </p>
            </CardContent>
        </Card>
    );
}

function programName(program: ProgramReference | undefined): string {
    return program?.name ?? 'Program';
}

function ProgramTitle({
    fallback,
    program,
}: {
    fallback: string;
    program: ProgramReference | undefined;
}) {
    return program === undefined ? (
        fallback
    ) : (
        <Link
            className="hover:underline"
            href={routes.lifting.program(program.slug)}
        >
            {program.name}
        </Link>
    );
}

function unenrollAction(
    program: ProgramReference | undefined,
    onSelect: () => void,
): RowSelectAction {
    return {
        confirm: {
            confirmLabel: 'Unenroll',
            description:
                'Your progress for this enrollment will be removed. You can re-enroll later.',
            title: `Unenroll from ${program?.name ?? 'program'}?`,
        },
        icon: LogOut,
        isDestructive: true,
        kind: RowActionKind.Select,
        label: 'Unenroll',
        onSelect,
    };
}
