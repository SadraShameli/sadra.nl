'use client';

import { formatDistanceToNow } from 'date-fns';
import { ClipboardList, Eye } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import type { Outcome, TradeAssessmentRow } from '~/lib/trading/types';

import { RowActionKind, rowActionsColumn } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { dateKey, filterAssessments } from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

import {
    assessmentLabel,
    GradeTile,
    MENTAL_FLAG_LABEL,
    MENTAL_FLAGS,
    type MentalFlag,
    OutcomeBadge,
} from './AssessmentBadges';
import { AssessmentDetailDialog } from './journal/AssessmentDetailDialog';
import {
    isJournalFiltered,
    JournalFilters,
    type JournalFilterState,
} from './journal/JournalFilters';

const SINGLE_DATE_SCHEMA = z.iso.date();

interface JournalViewProperties {
    history: TradeAssessmentRow[];
    plans: { id: string; name: string }[];
}

interface Row {
    createdAt: Date | string;
    grade: string;
    id: string;
    mentalFlags: MentalFlag[];
    notesSnippet: string;
    outcome: null | Outcome;
    outcomeR: null | number;
    raw: TradeAssessmentRow;
    score: number;
    windowLabel: null | string;
}

export function JournalView({ history, plans }: JournalViewProperties) {
    const router = useRouter();
    const searchParameters = useSearchParams();
    const state = useMemo(
        () =>
            parseStateFromUrl(new URLSearchParams(searchParameters.toString())),
        [searchParameters],
    );
    const [selectedRow, setSelectedRow] = useState<null | TradeAssessmentRow>(
        null,
    );

    const projected = useMemo(
        () =>
            history.map((r) => {
                const mentalFlags = MENTAL_FLAGS.filter(
                    (flag) => r.answers.mental[flag],
                );
                const notesSnippet = [
                    r.answers.finals.notes,
                    r.outcomeNotes ?? '',
                ]
                    .filter(Boolean)
                    .join(' · ');
                const windowLabel =
                    r.planSnapshot.windows.find(
                        (w) => w.id === r.answers.context.windowId,
                    )?.label ?? null;
                return {
                    componentScores: r.result.componentScores,
                    createdAt: r.createdAt,
                    grade: r.grade,
                    id: r.id,
                    mentalFlags,
                    notesSnippet,
                    outcome: r.outcome,
                    outcomeNotes: r.outcomeNotes,
                    outcomeR: r.outcomeR,
                    planId: r.planId,
                    planSnapshotWindows: r.planSnapshot.windows,
                    raw: r,
                    score: r.score,
                    setupType: r.answers.state.setupType,
                    windowId: r.answers.context.windowId,
                    windowLabel,
                };
            }),
        [history],
    );

    const filtered = useMemo(() => {
        const result = filterAssessments(projected, {
            dateFrom: state.dateFrom,
            dateTo: state.dateTo,
            grades: state.grades,
            mentalFlags: state.mentalFlags,
            outcomes: state.outcomes,
            planIds: state.planIds,
            query: state.query,
            setupTypes: state.setupTypes,
            windowIds: state.windowIds,
        });
        return state.singleDate
            ? result.filter((r) => dateKey(r.createdAt) === state.singleDate)
            : result;
    }, [projected, state]);

    const updateState = useCallback(
        (next: JournalFilterState) => {
            const sp = buildSearchParameters(next);
            const qs = sp.toString();
            router.replace(qs ? `?${qs}` : '?', { scroll: false });
        },
        [router],
    );

    const clear = () =>
        updateState({
            dateFrom: null,
            dateTo: null,
            grades: [],
            mentalFlags: [],
            outcomes: [],
            planIds: [],
            query: null,
            setupTypes: [],
            singleDate: null,
            windowIds: [],
        });

    const hasFiltersActive = isJournalFiltered(state);

    const columns = useMemo<DataTableColumn<Row>[]>(
        () => [
            {
                accessorKey: 'grade',
                cell: ({ row }) => <GradeTile grade={row.original.grade} />,
                enableSorting: false,
                header: 'Grade',
                id: 'grade',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'score',
                cell: ({ row }) => (
                    <span className="font-mono tabular-nums">
                        {row.original.score.toFixed(0)}
                        <span className="text-muted-foreground">/100</span>
                    </span>
                ),
                header: 'Score',
                id: 'score',
                sortDescFirst: true,
            },
            {
                cell: ({ row }) =>
                    row.original.outcome === null ? (
                        <span className="text-muted-foreground">Open</span>
                    ) : (
                        <OutcomeBadge
                            outcome={row.original.outcome}
                            outcomeR={row.original.outcomeR}
                        />
                    ),
                enableSorting: false,
                header: 'Outcome',
                id: 'outcome',
            },
            {
                cell: ({ row }) => (
                    <span
                        className={cn(
                            'whitespace-nowrap',
                            row.original.windowLabel === null &&
                                'text-muted-foreground',
                        )}
                    >
                        {row.original.windowLabel ?? 'Outside window'}
                    </span>
                ),
                enableSorting: false,
                header: 'Window',
                id: 'window',
            },
            {
                cell: ({ row }) =>
                    row.original.mentalFlags.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {row.original.mentalFlags.map((flag) => (
                                <Badge key={flag}>
                                    {MENTAL_FLAG_LABEL[flag]}
                                </Badge>
                            ))}
                        </div>
                    ),
                enableSorting: false,
                header: 'Mental flags',
                id: 'mental',
            },
            {
                cell: ({ row }) => (
                    <p className="m-0 line-clamp-2 max-w-80 text-muted-foreground">
                        {row.original.notesSnippet || 'No notes'}
                    </p>
                ),
                enableSorting: false,
                header: 'Notes',
                id: 'notes',
            },
            {
                accessorFn: (r) => new Date(r.createdAt).getTime(),
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {formatDistanceToNow(new Date(row.original.createdAt), {
                            addSuffix: true,
                        })}
                    </span>
                ),
                header: 'When',
                id: 'when',
                sortDescFirst: true,
            },
            rowActionsColumn<Row>({
                actionsOf: (row) => [
                    {
                        icon: Eye,
                        kind: RowActionKind.Select,
                        label: 'View',
                        onSelect: () => setSelectedRow(row.raw),
                    },
                ],
                labelOf: assessmentLabel,
            }),
        ],
        [],
    );

    return (
        <ToolPanel
            className="app-trade-checklist__journal-view"
            contentClassName="gap-4"
            description={
                <>
                    {filtered.length} of {history.length} assessments
                    {hasFiltersActive && ' (filtered)'}
                </>
            }
            info="Filter state lives in the URL so views are shareable."
            title="Assessments"
        >
            <JournalFilters
                onChange={updateState}
                onClear={clear}
                plans={plans}
                rows={projected}
                state={state}
            />

            <DataTable<Row>
                columns={columns}
                data={filtered}
                emptyState={
                    <EmptyState
                        description={
                            hasFiltersActive
                                ? 'Try clearing your filters or picking another date.'
                                : 'Run the checklist to log your first trade assessment.'
                        }
                        icon={ClipboardList}
                        title={
                            hasFiltersActive
                                ? 'No matching assessments'
                                : 'No assessments yet'
                        }
                    />
                }
                pageSize={25}
                rowId={(r) => r.id}
            />

            <AssessmentDetailDialog
                onClose={() => setSelectedRow(null)}
                row={selectedRow}
            />
        </ToolPanel>
    );
}

function buildSearchParameters(state: JournalFilterState): URLSearchParams {
    const sp = new URLSearchParams();
    for (const g of state.grades) sp.append('grade', g);
    for (const o of state.outcomes) sp.append('outcome', o);
    for (const w of state.windowIds) sp.append('windowId', w);
    for (const s of state.setupTypes) sp.append('setupType', s);
    for (const p of state.planIds) sp.append('planId', p);
    for (const m of state.mentalFlags) sp.append('mental', m);
    if (state.query && state.query.trim().length > 0)
        sp.set('q', state.query.trim());
    if (state.dateFrom) sp.set('dateFrom', state.dateFrom);
    if (state.dateTo) sp.set('dateTo', state.dateTo);
    if (state.singleDate) sp.set('date', state.singleDate);
    return sp;
}

function parseMulti(sp: URLSearchParams, key: string): string[] {
    const v = sp.getAll(key);
    return v.filter((x) => x.length > 0);
}

function parseStateFromUrl(sp: URLSearchParams): JournalFilterState {
    return {
        dateFrom: sp.get('dateFrom'),
        dateTo: sp.get('dateTo'),
        grades: parseMulti(sp, 'grade'),
        mentalFlags: parseMulti(
            sp,
            'mental',
        ) as JournalFilterState['mentalFlags'],
        outcomes: parseMulti(sp, 'outcome'),
        planIds: parseMulti(sp, 'planId'),
        query: sp.get('q'),
        setupTypes: parseMulti(sp, 'setupType'),
        singleDate: singleDateParameter(sp.get('date')),
        windowIds: parseMulti(sp, 'windowId'),
    };
}

function singleDateParameter(raw: null | string): null | string {
    const parsed = SINGLE_DATE_SCHEMA.safeParse(raw);
    return parsed.success ? parsed.data : null;
}
