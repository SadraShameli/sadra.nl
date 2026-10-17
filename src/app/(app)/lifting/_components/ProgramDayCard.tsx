import { Moon } from 'lucide-react';

import type { ProgramBlock, ProgramDay } from '~/lib/lifting/types';

import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

interface BlockRow {
    readonly detail: null | string;
    readonly name: string;
    readonly scheme: string;
}

export function ProgramDayCard({
    day,
    dayNumber,
}: {
    readonly day: ProgramDay;
    readonly dayNumber: number;
}) {
    const rows = day.blocks.flatMap(blockRows);
    return (
        <Card className="gap-4 py-5">
            <CardHeader className="px-5">
                <p className="text-xs font-medium text-muted-foreground tabular-nums">
                    Day {dayNumber}
                </p>
                <CardTitle className="flex items-center gap-2 text-base">
                    {day.name || `Day ${String(dayNumber)}`}
                    {day.isDeload && <Badge variant="secondary">Deload</Badge>}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
                {rows.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Moon aria-hidden className="size-4" />
                        Rest day
                    </p>
                ) : (
                    <ul className="divide-y divide-border/60">
                        {rows.map((row, index) => (
                            <li
                                className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0"
                                key={`${String(index)}-${row.name}`}
                            >
                                <span className="min-w-0 text-sm text-foreground">
                                    {row.name}
                                    {row.detail !== null && (
                                        <span className="block text-xs text-muted-foreground">
                                            {row.detail}
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                                    {row.scheme}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

function blockRows(block: ProgramBlock): readonly BlockRow[] {
    switch (block.kind) {
        case 'amrap': {
            return [
                {
                    detail: percentDetail(block.pct1rm),
                    name: exerciseName(block.exerciseSlug),
                    scheme:
                        block.targetReps === undefined
                            ? 'AMRAP'
                            : `AMRAP, ${String(block.targetReps)}+`,
                },
            ];
        }
        case 'emom': {
            return [
                {
                    detail: null,
                    name: exerciseName(block.exerciseSlug),
                    scheme: `EMOM ${String(block.minutes)} min × ${String(block.repsPerMinute)}`,
                },
            ];
        }
        case 'pyramid': {
            return [
                {
                    detail: null,
                    name: exerciseName(block.exerciseSlug),
                    scheme: block.setSchemes
                        .map((set) => String(set.reps))
                        .join(' / '),
                },
            ];
        }
        case 'straight': {
            return [
                {
                    detail: percentDetail(block.pct1rm),
                    name: exerciseName(block.exerciseSlug),
                    scheme: `${String(block.sets)} × ${String(block.reps)}`,
                },
            ];
        }
        case 'superset': {
            return block.group.flatMap(blockRows).map((row) => ({
                ...row,
                detail:
                    row.detail === null
                        ? 'Superset'
                        : `Superset, ${row.detail}`,
            }));
        }
        case 'topset_backoff': {
            return [
                {
                    detail: `Top set at ${String(block.topPct)}% of 1RM, back-off at ${String(block.backoffPct)}%`,
                    name: exerciseName(block.exerciseSlug),
                    scheme: `1 + ${String(block.backoffSets)} × ${String(block.reps)}`,
                },
            ];
        }
    }
}

function exerciseName(slug: string): string {
    const words = slug.replaceAll('-', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function percentDetail(pct1rm: number | undefined): null | string {
    return pct1rm === undefined ? null : `At ${String(pct1rm)}% of 1RM`;
}
