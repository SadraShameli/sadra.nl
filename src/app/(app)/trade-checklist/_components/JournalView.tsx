'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { dateKey, filterAssessments } from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

import { AssessmentDetailDialog } from './journal/AssessmentDetailDialog';
import {
    JournalFilters,
    type JournalFilterState,
} from './journal/JournalFilters';
import { JournalRowBody, type JournalRowData } from './journal/JournalRow';

interface JournalViewProperties {
    history: TradeAssessmentRow[];
    plans: { id: string; name: string }[];
}

type Row = JournalRowData & { raw: TradeAssessmentRow };

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
                const mentalFlags: string[] = [];
                if (r.answers.mental.hesitation) mentalFlags.push('hesitation');
                if (r.answers.mental.distracted) mentalFlags.push('distracted');
                if (r.answers.mental.revengeOrFomo)
                    mentalFlags.push('revengeOrFomo');
                if (r.answers.mental.boredomHunt)
                    mentalFlags.push('boredomHunt');
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
        if (state.singleDate) {
            return result.filter(
                (r) => dateKey(r.createdAt) === state.singleDate,
            );
        }
        return result;
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

    const hasFiltersActive =
        state.grades.length > 0 ||
        state.outcomes.length > 0 ||
        state.windowIds.length > 0 ||
        state.setupTypes.length > 0 ||
        state.mentalFlags.length > 0 ||
        state.planIds.length > 0 ||
        (state.query !== null && state.query.length > 0) ||
        state.dateFrom !== null ||
        state.dateTo !== null ||
        state.singleDate !== null;

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                cell: ({ row }) => (
                    <Button
                        className="-mx-2 -my-1 block h-auto w-full justify-start px-2 py-1 text-left font-normal"
                        onClick={() => setSelectedRow(row.original.raw)}
                        type="button"
                        variant="ghost"
                    >
                        <JournalRowBody row={row.original} />
                    </Button>
                ),
                enableSorting: false,
                header: 'Assessment',
                id: 'assessment',
            },
            {
                accessorFn: (r) => new Date(r.createdAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {formatDistanceToNow(new Date(row.original.createdAt), {
                            addSuffix: true,
                        })}
                    </span>
                ),
                header: 'When',
                id: 'when',
                sortDescFirst: true,
            },
        ],
        [],
    );

    return (
        <div
            className={cn(
                'app-trade-checklist__journal-view',
                'flex flex-col gap-4',
            )}
        >
            <JournalFilters
                onChange={updateState}
                onClear={clear}
                plans={plans}
                rows={projected}
                state={state}
            />

            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {filtered.length} of {history.length} assessments
                    {hasFiltersActive && ' (filtered)'}
                </p>
                {state.singleDate && (
                    <Badge variant="outline">On {state.singleDate}</Badge>
                )}
            </div>

            <DataTable<Row, unknown>
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
        </div>
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
        singleDate: sp.get('date'),
        windowIds: parseMulti(sp, 'windowId'),
    };
}
