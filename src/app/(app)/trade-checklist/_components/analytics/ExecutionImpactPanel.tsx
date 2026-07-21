'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { formatPercent, formatR } from '~/lib/format';
import {
    deviationFrequency,
    executionImpactByGrade,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

const DEVIATION_LABELS: Record<string, string> = {
    'chased-entry': 'Chased entry',
    'entered-late': 'Entered late',
    'exited-before-target': 'Exited before target',
    'exited-past-target': 'Exited past target',
    'moved-stop-early': 'Moved stop early',
    'moved-stop-to-be': 'Moved stop to BE',
    'no-fill': 'No fill',
    'sized-down': 'Sized down',
    'sized-up': 'Sized up',
};

export function ExecutionImpactPanel({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const impact = useMemo(
        () => executionImpactByGrade(assessments)[0],
        [assessments],
    );
    const freq = useMemo(() => deviationFrequency(assessments), [assessments]);

    const hasComparison =
        impact && impact.followed.count >= 3 && impact.deviated.count >= 3;

    return (
        <div
            className={cn(
                'app-trade-checklist__execution-impact-panel',
                'flex flex-col gap-4',
            )}
        >
            <div>
                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Plan-followed vs deviated
                </p>
                {hasComparison ? (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <Card className="p-4">
                            <p className="text-xs text-emerald-300">
                                Followed plan
                            </p>
                            <p className="mt-1 font-mono text-2xl text-emerald-400">
                                {formatPercent(impact.followed.winRate, 0)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {impact.followed.count} trade
                                {impact.followed.count === 1 ? '' : 's'} ·{' '}
                                {formatR(impact.followed.avgR)} avg
                            </p>
                        </Card>
                        <Card className="p-4">
                            <p className="text-xs text-amber-300">Deviated</p>
                            <p
                                className={cn(
                                    'mt-1 font-mono text-2xl',
                                    impact.deviated.winRate >
                                        impact.followed.winRate
                                        ? 'text-emerald-400'
                                        : 'text-rose-400',
                                )}
                            >
                                {formatPercent(impact.deviated.winRate, 0)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {impact.deviated.count} trade
                                {impact.deviated.count === 1 ? '' : 's'} ·{' '}
                                {formatR(impact.deviated.avgR)} avg
                            </p>
                        </Card>
                    </div>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                        Need at least 3 outcomes recorded for each cohort
                        (followed plan vs deviated). Use the &ldquo;Execution
                        details&rdquo; section when recording outcomes.
                    </p>
                )}
            </div>

            <div>
                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Most frequent deviations
                </p>
                {freq.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                        No deviations recorded yet.
                    </p>
                ) : (
                    <ul
                        className={cn(
                            'app-trade-checklist__deviations-list',
                            'mt-2 divide-y divide-border/40 rounded-md border border-border/40',
                        )}
                    >
                        {freq.map((d) => (
                            <li
                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                key={d.deviation}
                            >
                                <span>
                                    {DEVIATION_LABELS[d.deviation] ??
                                        d.deviation}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {d.count} · WR {formatPercent(d.winRate, 0)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
