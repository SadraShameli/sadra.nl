'use client';

import {
    ArrowRight,
    Calendar,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    LineChart,
    Pause,
    Pencil,
    Play,
    Search,
    Trash2,
    Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { FilterSelect } from '~/components/ui/filter-select';
import { Input } from '~/components/ui/input';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import {
    PROGRAM_CATEGORY_VALUES,
    type ProgramBlock,
    type ProgramCategory,
    USER_PROGRAM_STATUS,
    type UserProgramStatus,
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

const STATUS_VARIANT: Record<
    UserProgramStatus,
    'secondary' | 'success' | 'warning'
> = {
    active: 'success',
    completed: 'secondary',
    paused: 'warning',
};

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
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="Active"
                    value={activeEnrollments.length.toString()}
                />
                <StatCard
                    label="Enrollments"
                    value={totalEnrollments.toString()}
                />
                <StatCard label="Custom" value={ownedCount.toString()} />
                <StatCard label="Available" value={officialCount.toString()} />
            </section>

            {mine.isLoading ? (
                <Skeleton className="h-40 w-full rounded-2xl" />
            ) : (
                activeEnrollments.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                Active
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
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
                        </CardContent>
                    </Card>
                )
            )}

            {(otherEnrollments.length > 0 ||
                (mine.data?.owned.length ?? 0) > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            Your library
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {otherEnrollments.map((enrollment) => (
                                <EnrollmentCard
                                    enrollment={enrollment}
                                    key={enrollment.id}
                                    program={programsById.get(
                                        enrollment.programId,
                                    )}
                                />
                            ))}
                            {mine.data?.owned.map((p) => (
                                <OwnedProgramCard key={p.id} program={p} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <span>Browse programs</span>
                        <span className="text-[10px] font-normal tabular-nums">
                            {filtered.length} of {officialCount}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="relative w-fit">
                            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-muted" />
                            <Input
                                aria-label="Search programs"
                                className={cn(SEARCH_FIELD_CLASS, 'pl-9')}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Search programs"
                                value={search}
                            />
                        </div>
                        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                            <ClearFiltersButton
                                active={isFiltersActive}
                                onReset={() => {
                                    setSearch('');
                                    setCategory('all');
                                    setDays('all');
                                }}
                            />
                            <FilterSelect
                                label="Category"
                                onValueChange={(v) =>
                                    setCategory(
                                        PROGRAM_CATEGORY_VALUES.find(
                                            (c) => c === v,
                                        ) ?? 'all',
                                    )
                                }
                                options={PROGRAM_CATEGORY_VALUES.map((c) => ({
                                    label: (
                                        <span className="capitalize">{c}</span>
                                    ),
                                    value: c,
                                }))}
                                placeholder="All categories"
                                value={
                                    category === 'all' ? undefined : category
                                }
                            />
                            <FilterSelect
                                label="Frequency"
                                onValueChange={(v) =>
                                    setDays(
                                        DAYS_FILTER_VALUES.find(
                                            (d) => d === v,
                                        ) ?? 'all',
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
                                    const next = SORT_VALUES.find(
                                        (key) => key === v,
                                    );
                                    if (next) setSort(next);
                                }}
                                options={SORT_VALUES.map((key) => ({
                                    label: SORT_LABEL[key],
                                    value: key,
                                }))}
                                value={sort}
                            />
                        </div>
                    </div>

                    {filtered.length === 0 && (
                        <EmptyState
                            description={
                                isFiltersActive
                                    ? 'Try clearing some filters.'
                                    : 'No programs available yet.'
                            }
                            icon={Search}
                            title="No programs match"
                        />
                    )}

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
                </CardContent>
            </Card>
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
                        <Badge className="w-fit" variant="success">
                            Active
                        </Badge>
                        <h3 className="text-lg font-semibold">
                            {program?.name ?? 'Program'}
                        </h3>
                        <p className="text-xs text-muted-foreground tabular-nums">
                            Week {enrollment.currentWeek} of{' '}
                            {program?.lengthWeeks ?? '-'} · Day{' '}
                            {enrollment.currentDay}
                        </p>
                    </div>
                    {program && (
                        <Button
                            asChild
                            className="gap-1.5"
                            size="sm"
                            type="button"
                        >
                            <Link href={routes.lifting.program(program.slug)}>
                                Open <ChevronRight className="size-3.5" />
                            </Link>
                        </Button>
                    )}
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

                <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPreviewOpen((o) => !o)}
                    type="button"
                >
                    {previewOpen ? (
                        <ChevronUp className="size-3.5" />
                    ) : (
                        <ChevronDown className="size-3.5" />
                    )}
                    {previewOpen ? 'Hide' : 'Preview'} upcoming session
                </button>

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

                <div className="flex flex-wrap gap-2">
                    <Button
                        className="gap-1.5"
                        disabled={advance.isPending}
                        onClick={() => advance.mutate({ id: enrollment.id })}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        <Check className="size-3.5" /> Mark day done
                    </Button>
                    <Button
                        className="gap-1.5"
                        disabled={updateEnrollment.isPending}
                        onClick={() =>
                            updateEnrollment.mutate({
                                id: enrollment.id,
                                status: USER_PROGRAM_STATUS.PAUSED,
                            })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        <Pause className="size-3.5" /> Pause
                    </Button>
                    <ConfirmDialog
                        confirmLabel="Unenroll"
                        description="Your progress for this enrollment will be removed. You can re-enroll later."
                        onConfirm={() => unenroll.mutate({ id: enrollment.id })}
                        title={<>Unenroll from {program?.name ?? 'program'}?</>}
                    >
                        <Button
                            className="ml-auto gap-1.5 text-destructive"
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            <Trash2 className="size-3.5" /> Unenroll
                        </Button>
                    </ConfirmDialog>
                </div>
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
    const variant = STATUS_VARIANT[status];
    const total = program?.lengthWeeks ?? 0;
    const pct = total > 0 ? (enrollment.currentWeek / total) * 100 : 0;

    return (
        <Card className="py-4">
            <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <Badge variant={variant}>{status}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        W{enrollment.currentWeek} · D{enrollment.currentDay}
                    </span>
                </div>
                <h3 className="text-sm font-semibold">
                    {program?.name ?? '-'}
                </h3>
                <Progress className="h-1.5" value={pct} />
                <div className="flex flex-wrap gap-2">
                    {status === 'paused' && (
                        <Button
                            className="gap-1.5"
                            disabled={resume.isPending}
                            onClick={() =>
                                resume.mutate({
                                    id: enrollment.id,
                                    status: USER_PROGRAM_STATUS.ACTIVE,
                                })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            <Play className="size-3.5" /> Resume
                        </Button>
                    )}
                    {program && (
                        <Button
                            asChild
                            className="gap-1.5"
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            <Link href={routes.lifting.program(program.slug)}>
                                Open
                            </Link>
                        </Button>
                    )}
                    <Button
                        className="ml-auto gap-1.5 text-destructive"
                        disabled={unenroll.isPending}
                        onClick={() => unenroll.mutate({ id: enrollment.id })}
                        size="sm"
                        type="button"
                        variant="ghost"
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
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
                            <h3 className="font-semibold">{program.name}</h3>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{program.category}</Badge>
                        <Badge variant="secondary">
                            <Calendar className="mr-1 size-3" />
                            {program.daysPerWeek}× / wk
                        </Badge>
                        <Badge variant="secondary">
                            {program.lengthWeeks} weeks
                        </Badge>
                        {enrolled && (
                            <Badge variant="success">
                                <Trophy className="mr-1 size-3" /> Enrolled
                            </Badge>
                        )}
                        {!enrolled && inLibrary && (
                            <Badge variant="warning">In library</Badge>
                        )}
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
                    <Badge variant="secondary">Custom</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {program.daysPerWeek}× · {program.lengthWeeks}w
                    </span>
                </div>
                <h3 className="text-sm font-semibold">{program.name}</h3>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                    {program.description ?? 'No description.'}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button
                        asChild
                        className="gap-1.5"
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        <Link href={routes.lifting.program(program.slug)}>
                            <Pencil className="size-3.5" /> Open
                        </Link>
                    </Button>
                    <ConfirmDialog
                        confirmLabel="Delete"
                        description="This is a custom program. Deleting it removes the program and any enrollments."
                        onConfirm={() => remove.mutate({ id: program.id })}
                        title={<>Delete {program.name}?</>}
                    >
                        <Button
                            className="ml-auto gap-1.5 text-destructive"
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            <Trash2 className="size-3.5" /> Delete
                        </Button>
                    </ConfirmDialog>
                </div>
            </CardContent>
        </Card>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Card className="gap-1 py-3">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
                <span className="font-mono text-lg leading-none font-bold text-foreground tabular-nums">
                    {value}
                </span>
            </CardContent>
        </Card>
    );
}
