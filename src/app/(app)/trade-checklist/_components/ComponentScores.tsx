import { Ban } from 'lucide-react';

import type { AssessmentResult, ComponentScore } from '~/lib/schemas/trading';

import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Progress } from '~/components/ui/progress';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';

const FULL_PERCENT = 100;

export function ComponentScoreMeter({
    label,
    score,
}: {
    readonly label: string;
    readonly score: ComponentScore;
}) {
    const isScored = isComponentScored(score);
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                    {label}
                </span>
                {isScored ? (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {score.earned.toFixed(1)} / {score.max.toFixed(0)}
                    </span>
                ) : (
                    <span className="text-xs text-ink-muted">Skipped</span>
                )}
            </div>
            {isScored && (
                <Progress
                    className="h-1.5"
                    value={Math.min(
                        FULL_PERCENT,
                        (score.earned / score.max) * FULL_PERCENT,
                    )}
                />
            )}
        </div>
    );
}

export function ComponentScoresNotScored() {
    return (
        <EmptyState
            description="A knockout ended the assessment before any component was scored."
            icon={Ban}
            size={EmptyStateSize.Compact}
            title="Not scored"
        />
    );
}

export function hasScoredComponents(
    scores: AssessmentResult['componentScores'],
): boolean {
    return WEIGHT_CATEGORIES.some((category) =>
        isComponentScored(scores[category.key]),
    );
}

function isComponentScored(score: ComponentScore): boolean {
    return score.max > 0;
}
