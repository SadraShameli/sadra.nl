import type {
    ExecutionDeviation,
    Outcome,
    Recommendation,
} from '~/lib/trading/types';

import { Badge } from '~/components/ui/badge';
import { formatDisplayDateTime } from '~/lib/format';
import {
    EXECUTION_DEVIATION_VALUES,
    RECOMMENDATION_VALUES,
} from '~/lib/trading/types';
import { cn } from '~/lib/utilities';

export const MENTAL_FLAGS = [
    'hesitation',
    'distracted',
    'revengeOrFomo',
    'boredomHunt',
] as const;

export type MentalFlag = (typeof MENTAL_FLAGS)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
    breakeven: 'Breakeven',
    loss: 'Loss',
    'no-trade': 'No trade',
    win: 'Win',
};

export const MENTAL_FLAG_LABEL: Record<MentalFlag, string> = {
    boredomHunt: 'Boredom',
    distracted: 'Distracted',
    hesitation: 'Hesitation',
    revengeOrFomo: 'Revenge/FOMO',
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
    'hard-skip': 'Hard skip',
    marginal: 'Marginal',
    skip: 'Skip',
    'strong-take': 'Strong take',
    take: 'Take',
};

export const EXECUTION_DEVIATION_LABEL: Record<ExecutionDeviation, string> = {
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

export function assessmentLabel({
    createdAt,
    grade,
}: {
    readonly createdAt: Date | string;
    readonly grade: string;
}): string {
    return `${grade} assessment from ${formatDisplayDateTime(createdAt)}`;
}

export function executionDeviationLabel(value: string): string {
    const known = EXECUTION_DEVIATION_VALUES.find(
        (deviation) => deviation === value,
    );
    return known === undefined ? value : EXECUTION_DEVIATION_LABEL[known];
}

export function GradeTile({
    className,
    grade,
}: {
    readonly className?: string;
    readonly grade: string;
}) {
    return (
        <span
            className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-muted font-serif text-lg text-foreground',
                className,
            )}
        >
            {grade}
        </span>
    );
}

export function OutcomeBadge({
    outcome,
    outcomeR,
}: {
    readonly outcome: Outcome;
    readonly outcomeR: null | number;
}) {
    return (
        <Badge className="gap-1.5">
            {OUTCOME_LABEL[outcome]}
            {outcomeR !== null && (
                <span className="font-mono tabular-nums">
                    {outcomeR > 0 ? '+' : ''}
                    {outcomeR.toFixed(1)}R
                </span>
            )}
        </Badge>
    );
}

export function recommendationLabel(value: string): string {
    const known = RECOMMENDATION_VALUES.find(
        (recommendation) => recommendation === value,
    );
    return known === undefined ? value : RECOMMENDATION_LABEL[known];
}
