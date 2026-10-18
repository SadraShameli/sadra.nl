'use client';

import { ChartBar } from 'lucide-react';
import { useMemo } from 'react';

import { OUTCOME_LABEL } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { EmptyState } from '~/components/ui/empty-state';
import { Progress } from '~/components/ui/progress';
import { formatPercent } from '~/lib/format';
import {
    type LightAssessment,
    outcomeDistribution,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

const FULL_PERCENT = 100;

export function OutcomeDistribution({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () => outcomeDistribution(assessments).filter((d) => d.count > 0),
        [assessments],
    );

    return data.length === 0 ? (
        <EmptyState
            description="Record outcomes to see how they are distributed."
            icon={ChartBar}
            title="No outcomes yet"
        />
    ) : (
        <ul
            className={cn(
                'app-trade-checklist__outcome-distribution',
                'm-0 flex list-none flex-col gap-4 p-0',
            )}
        >
            {data.map((d) => {
                const label = OUTCOME_LABEL[d.outcome];
                const share = formatPercent(d.share, 0);
                return (
                    <li className="flex flex-col gap-1.5" key={d.outcome}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-ink">{label}</span>
                            <span className="font-mono text-ink tabular-nums">
                                {d.count} · {share}
                            </span>
                        </div>
                        <Progress
                            aria-label={`${label}: ${share}`}
                            className="h-1.5"
                            value={d.share * FULL_PERCENT}
                        />
                    </li>
                );
            })}
        </ul>
    );
}
