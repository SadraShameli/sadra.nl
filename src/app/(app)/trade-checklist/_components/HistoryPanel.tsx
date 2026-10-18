'use client';

import { formatDistanceToNow } from 'date-fns';
import { ClipboardList, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import { deleteRowAction, RowActionsMenu } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { EmptyState } from '~/components/ui/empty-state';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '~/components/ui/item';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { cn, parseEnum } from '~/lib/utilities';

import { assessmentLabel, GradeTile, OutcomeBadge } from './AssessmentBadges';

const GRADE_ORDER: Partial<Record<string, number>> = {
    A: 1,
    'A+': 0,
    'A-': 2,
    B: 4,
    'B+': 3,
    'B-': 5,
    C: 7,
    'C+': 6,
    'C-': 8,
    D: 9,
    F: 10,
};

enum SortMode {
    Grade = 'grade',
    Newest = 'newest',
    Oldest = 'oldest',
}

const SORT_OPTIONS: readonly { label: string; value: SortMode }[] = [
    { label: 'Newest', value: SortMode.Newest },
    { label: 'Oldest', value: SortMode.Oldest },
    { label: 'Grade', value: SortMode.Grade },
];

export function HistoryPanel({
    history,
    isDeletePending,
    onDelete,
    onDeleteAll,
    onSelect,
}: {
    history: TradeAssessmentRow[];
    isDeletePending: boolean;
    onDelete: (id: string) => void;
    onDeleteAll: () => void;
    onSelect: (row: TradeAssessmentRow) => void;
}) {
    const [sortMode, setSortMode] = useState(SortMode.Newest);
    const count = history.length;

    return (
        <ToolPanel
            actions={
                count > 0 && (
                    <ConfirmDialog
                        confirmLabel="Delete all"
                        description="Every grade and outcome in your history will be removed permanently."
                        isPending={isDeletePending}
                        onConfirm={onDeleteAll}
                        title="Delete all assessments?"
                    >
                        <Button
                            disabled={isDeletePending}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            <Trash2 data-icon="inline-start" />
                            Clear all
                        </Button>
                    </ConfirmDialog>
                )
            }
            className="app-trade-checklist__history"
            description={count === 1 ? '1 assessment' : `${count} assessments`}
            title="Recent"
        >
            {count === 0 ? (
                <EmptyState
                    description="Grade a setup to start your history."
                    icon={ClipboardList}
                    title="No assessments yet"
                />
            ) : (
                <>
                    <ToggleGroup
                        aria-label="Sort assessments"
                        className="justify-start"
                        onValueChange={(selected) => {
                            const mode = parseEnum(SortMode, selected);
                            if (mode !== null) setSortMode(mode);
                        }}
                        size="sm"
                        type="single"
                        value={sortMode}
                        variant="outline"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <ToggleGroupItem key={o.value} value={o.value}>
                                {o.label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <ScrollArea className="-mx-1 *:data-radix-scroll-area-viewport:max-h-115">
                        <ItemGroup
                            className={cn(
                                'app-trade-checklist__history-list',
                                'gap-2 px-1',
                            )}
                        >
                            {sortedRows(history, sortMode).map((row) => (
                                <HistoryRow
                                    key={row.id}
                                    onDelete={onDelete}
                                    onSelect={onSelect}
                                    row={row}
                                />
                            ))}
                        </ItemGroup>
                    </ScrollArea>
                </>
            )}
        </ToolPanel>
    );
}

function HistoryRow({
    onDelete,
    onSelect,
    row,
}: {
    onDelete: (id: string) => void;
    onSelect: (row: TradeAssessmentRow) => void;
    row: TradeAssessmentRow;
}) {
    return (
        <div className="flex items-center gap-1">
            <Item
                asChild
                className="h-auto min-w-0 flex-1 justify-start rounded-2xl border-line text-left font-normal whitespace-normal hover:bg-muted/40"
                size="sm"
                variant="outline"
            >
                <Button
                    className="app-trade-checklist__history-item"
                    onClick={() => onSelect(row)}
                    type="button"
                    variant="ghost"
                >
                    <ItemMedia>
                        <GradeTile grade={row.grade} />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                        <ItemTitle className="font-mono tabular-nums">
                            {row.score.toFixed(0)}
                            <span className="text-muted-foreground">/100</span>
                        </ItemTitle>
                        <ItemDescription className="truncate">
                            {formatDistanceToNow(new Date(row.createdAt), {
                                addSuffix: true,
                            })}
                        </ItemDescription>
                    </ItemContent>
                    {row.outcome !== null && (
                        <ItemActions>
                            <OutcomeBadge
                                outcome={row.outcome}
                                outcomeR={row.outcomeR}
                            />
                        </ItemActions>
                    )}
                </Button>
            </Item>
            <RowActionsMenu
                actions={[
                    deleteRowAction({
                        description:
                            'This grade and outcome will be removed permanently.',
                        onDelete: () => onDelete(row.id),
                        title: 'Delete assessment?',
                    }),
                ]}
                label={assessmentLabel(row)}
            />
        </div>
    );
}

function sortedRows(
    history: TradeAssessmentRow[],
    mode: SortMode,
): TradeAssessmentRow[] {
    switch (mode) {
        case SortMode.Grade: {
            return history.toSorted((a, b) => {
                const ga = GRADE_ORDER[a.grade] ?? 99;
                const gb = GRADE_ORDER[b.grade] ?? 99;
                return ga === gb
                    ? new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime()
                    : ga - gb;
            });
        }
        case SortMode.Newest: {
            return history;
        }
        case SortMode.Oldest: {
            return history.toReversed();
        }
    }
}
