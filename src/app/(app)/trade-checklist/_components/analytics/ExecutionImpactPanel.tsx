'use client';

import { ListChecks } from 'lucide-react';
import { useMemo } from 'react';

import { executionDeviationLabel } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatPercent, formatR } from '~/lib/format';
import {
    deviationFrequency,
    executionImpactByGrade,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

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
            <div className="flex flex-col gap-2">
                <PanelSubheading>Plan-followed vs deviated</PanelSubheading>
                {hasComparison ? (
                    <StatStrip
                        items={[
                            {
                                caption: cohortCaption(impact.followed),
                                id: 'followed-plan',
                                label: 'Followed plan',
                                value: formatPercent(
                                    impact.followed.winRate,
                                    0,
                                ),
                            },
                            {
                                caption: cohortCaption(impact.deviated),
                                id: 'deviated',
                                label: 'Deviated',
                                value: formatPercent(
                                    impact.deviated.winRate,
                                    0,
                                ),
                            },
                        ]}
                    />
                ) : (
                    <StatusRow
                        detail={
                            <>
                                Use the &ldquo;Execution details&rdquo; section
                                when recording outcomes.
                            </>
                        }
                        title="Need at least 3 outcomes recorded for each cohort (followed plan vs deviated)."
                        tone={StatusTone.Neutral}
                    />
                )}
            </div>

            <div className="flex flex-col gap-2">
                <PanelSubheading>Most frequent deviations</PanelSubheading>
                {freq.length === 0 ? (
                    <EmptyState
                        description="Deviations you tag when recording outcomes show up here."
                        icon={ListChecks}
                        size={EmptyStateSize.Compact}
                        title="No deviations yet"
                    />
                ) : (
                    <ul
                        className={cn(
                            'app-trade-checklist__deviations-list',
                            'divide-y divide-border/40 rounded-md border border-border/40',
                        )}
                    >
                        {freq.map((d) => (
                            <li
                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                key={d.deviation}
                            >
                                <span>
                                    {executionDeviationLabel(d.deviation)}
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

function cohortCaption({
    avgR,
    count,
}: {
    readonly avgR: number;
    readonly count: number;
}): string {
    return `${count} trade${count === 1 ? '' : 's'} · ${formatR(avgR)} avg`;
}
