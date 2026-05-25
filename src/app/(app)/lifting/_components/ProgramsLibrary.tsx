'use client';

import {
    ArrowRight,
    Calendar,
    Check,
    ChevronRight,
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
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    PROGRAM_CATEGORY_VALUES,
    type ProgramCategory,
    USER_PROGRAM_STATUS,
    type UserProgramStatus,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type Enrollment =
    RouterOutputs['lifting']['program']['listMine']['enrollments'][number];
type OfficialProgram =
    RouterOutputs['lifting']['program']['listOfficial'][number];
type OwnedProgram =
    RouterOutputs['lifting']['program']['listMine']['owned'][number];
type ProgramRef = OfficialProgram;

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

export function ProgramsLibrary() {
    const official = api.lifting.program.listOfficial.useQuery();
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
        for (const e of mine.data?.enrollments ?? []) ids.add(e.programId);
        return ids;
    }, [mine.data?.enrollments]);

    const ownedNames = useMemo(() => {
        const names = new Set<string>();
        for (const p of mine.data?.owned ?? []) names.add(p.name);
        return names;
    }, [mine.data?.owned]);

    const programsById = useMemo(() => {
        const map = new Map<string, ProgramRef>();
        for (const p of official.data ?? []) map.set(p.id, p);
        for (const p of mine.data?.owned ?? []) map.set(p.id, p);
        return map;
    }, [official.data, mine.data?.owned]);

    const filtered = useMemo(() => {
        const rows = official.data ?? [];
        const q = debouncedSearch.trim().toLowerCase();
        const out = rows.filter((p) => {
            if (category !== 'all' && p.category !== category) return false;
            if (days !== 'all' && p.daysPerWeek !== Number(days)) return false;
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
            if (sort === 'length') return a.lengthWeeks - b.lengthWeeks;
            return a.name.localeCompare(b.name);
        });
        return out;
    }, [official.data, debouncedSearch, category, days, sort]);

    const activeEnrollments = (mine.data?.enrollments ?? []).filter(
        (e) => e.status === 'active',
    );
    const otherEnrollments = (mine.data?.enrollments ?? []).filter(
        (e) => e.status !== 'active',
    );

    const filtersActive =
        debouncedSearch.length > 0 || category !== 'all' || days !== 'all';

    const totalEnrollments = mine.data?.enrollments.length ?? 0;
    const ownedCount = mine.data?.owned.length ?? 0;
    const officialCount = official.data?.length ?? 0;

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
                                {activeEnrollments.map((e) => (
                                    <ActiveEnrollmentCard
                                        enrollment={e}
                                        key={e.id}
                                        program={programsById.get(e.programId)}
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
                            {otherEnrollments.map((e) => (
                                <EnrollmentCard
                                    enrollment={e}
                                    key={e.id}
                                    program={programsById.get(e.programId)}
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
                        {official.data && (
                            <span className="text-[10px] font-normal tabular-nums">
                                {filtered.length} of {official.data.length}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Search</Label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="pl-8"
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search programs"
                                    value={search}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Category</Label>
                            <Select
                                onValueChange={(v) =>
                                    setCategory(v as 'all' | ProgramCategory)
                                }
                                value={category}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        All categories
                                    </SelectItem>
                                    {PROGRAM_CATEGORY_VALUES.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            <span className="capitalize">
                                                {c}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Frequency</Label>
                            <Select
                                onValueChange={(v) => setDays(v as DaysFilter)}
                                value={days}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        Any frequency
                                    </SelectItem>
                                    {DAYS_FILTER_VALUES.filter(
                                        (d) => d !== 'all',
                                    ).map((d) => (
                                        <SelectItem key={d} value={d}>
                                            {d}× / week
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Sort</Label>
                            <Select
                                onValueChange={(v) => setSort(v as SortKey)}
                                value={sort}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_VALUES.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {SORT_LABEL[s]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <ClearFiltersButton
                        active={filtersActive}
                        onReset={() => {
                            setSearch('');
                            setCategory('all');
                            setDays('all');
                        }}
                    />

                    {official.isLoading && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton
                                    className="h-36 w-full rounded-2xl"
                                    key={i}
                                />
                            ))}
                        </div>
                    )}

                    {!official.isLoading && filtered.length === 0 && (
                        <EmptyState
                            description={
                                filtersActive
                                    ? 'Try clearing some filters.'
                                    : 'No programs available yet.'
                            }
                            icon={Search}
                            title="No programs match"
                        />
                    )}

                    {!official.isLoading && filtered.length > 0 && (
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
    program: ProgramRef | undefined;
}) {
    const utils = api.useUtils();

    const invalidate = () => utils.lifting.program.listMine.invalidate();

    const advance = api.lifting.program.advance.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Advanced to next day.');
            await invalidate();
        },
    });

    const updateEnrollment = api.lifting.program.updateEnrollment.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Program paused.');
            await invalidate();
        },
    });

    const unenroll = api.lifting.program.unenroll.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Unenrolled.');
            await invalidate();
        },
    });

    const totalDays =
        program?.schedule.weeks.reduce((acc, w) => acc + w.days.length, 0) ?? 0;
    const completedDays = program
        ? program.schedule.weeks
              .slice(0, enrollment.currentWeek - 1)
              .reduce((acc, w) => acc + w.days.length, 0) +
          (enrollment.currentDay - 1)
        : 0;
    const pct = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;

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
                            {program?.lengthWeeks ?? '—'} · Day{' '}
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
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                className="ml-auto gap-1.5 text-destructive"
                                size="sm"
                                type="button"
                                variant="ghost"
                            >
                                <Trash2 className="size-3.5" /> Unenroll
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Unenroll from {program?.name ?? 'program'}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Your progress for this enrollment will be
                                    removed. You can re-enroll later.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() =>
                                        unenroll.mutate({ id: enrollment.id })
                                    }
                                >
                                    Unenroll
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}

function EnrollmentCard({
    enrollment,
    program,
}: {
    enrollment: Enrollment;
    program: ProgramRef | undefined;
}) {
    const utils = api.useUtils();
    const invalidate = () => utils.lifting.program.listMine.invalidate();
    const resume = api.lifting.program.updateEnrollment.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Resumed.');
            await invalidate();
        },
    });
    const unenroll = api.lifting.program.unenroll.useMutation({
        onError: (err) => toast.error(err.message),
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
                    {program?.name ?? '—'}
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
    const utils = api.useUtils();
    const remove = api.lifting.program.deleteCustom.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Custom program deleted.');
            await utils.lifting.program.listMine.invalidate();
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
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                className="ml-auto gap-1.5 text-destructive"
                                size="sm"
                                type="button"
                                variant="ghost"
                            >
                                <Trash2 className="size-3.5" /> Delete
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete {program.name}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This is a custom program. Deleting it
                                    removes the program and any enrollments.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() =>
                                        remove.mutate({ id: program.id })
                                    }
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
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
