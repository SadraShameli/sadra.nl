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
}: {
    readonly assumptions: readonly AssumptionView[];
}) {
    if (assumptions.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No inputs were defaulted for this advice.
            </p>
        );
    }
    return (
        <ul className="flex flex-col gap-1 text-sm">
            {assumptions.map((assumption, index) => (
                <li key={String(index)}>
                    {assumption.text}{' '}
                    <span
                        className={cn(
                            'text-xs tracking-wide uppercase',
                            assumption.bias === AssumptionBias.Optimistic &&
                                'text-amber-500',
                            assumption.bias === AssumptionBias.Conservative &&
                                'text-muted-foreground',
                        )}
                    >
                        ({BIAS_LABEL[assumption.bias]})
                    </span>
                </li>
            ))}
        </ul>
    );
}
