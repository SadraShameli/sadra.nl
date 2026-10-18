import type { Outcome } from '~/lib/trading/types';

import { Badge } from '~/components/ui/badge';
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
        <Badge className="gap-1.5" variant="outline">
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
