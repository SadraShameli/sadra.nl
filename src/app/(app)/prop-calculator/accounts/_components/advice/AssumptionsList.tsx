import { Badge } from '~/components/ui/badge';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { AssumptionBias } from '~/lib/prop-calculator/advisor';

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
                    <Badge asChild>
                        <span>unverified</span>
                    </Badge>{' '}
                    The firm data these figures rest on has no verification
                    date.
                </p>
            )}
            {assumptions.length === 0 ? (
                <EmptyState
                    size={EmptyStateSize.Compact}
                    title="No inputs were defaulted"
                />
            ) : (
                <ul className="flex flex-col gap-1 text-sm">
                    {assumptions.map((assumption, index) => (
                        <li key={String(index)}>
                            {assumption.text}{' '}
                            <Badge>{BIAS_LABEL[assumption.bias]}</Badge>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
