import { AssumptionBias } from '~/lib/prop-calculator/advisor';
import { cn } from '~/lib/utilities';

import { type AssumptionView } from './adviceViewModel';

const BIAS_LABEL: Readonly<Record<AssumptionBias, string>> = {
    [AssumptionBias.Conservative]: 'conservative',
    [AssumptionBias.Neutral]: 'neutral',
    [AssumptionBias.Optimistic]: 'optimistic',
};

export function AssumptionsList({
    assumptions,
    isFirmDataUnverified = false,
}: {
    readonly assumptions: readonly AssumptionView[];
    readonly isFirmDataUnverified?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1">
            {isFirmDataUnverified && (
                <p className="text-sm">
                    <span className="rounded border border-amber-500 px-1 text-xs tracking-wide text-amber-500 uppercase">
                        unverified
                    </span>{' '}
                    The firm data these figures rest on has no verification
                    date.
                </p>
            )}
            {assumptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No inputs were defaulted for this advice.
                </p>
            ) : (
                <ul className="flex flex-col gap-1 text-sm">
                    {assumptions.map((assumption, index) => (
                        <li key={String(index)}>
                            {assumption.text}{' '}
                            <span
                                className={cn(
                                    'text-xs tracking-wide uppercase',
                                    assumption.bias ===
                                        AssumptionBias.Optimistic &&
                                        'text-amber-500',
                                    assumption.bias ===
                                        AssumptionBias.Conservative &&
                                        'text-muted-foreground',
                                )}
                            >
                                ({BIAS_LABEL[assumption.bias]})
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
