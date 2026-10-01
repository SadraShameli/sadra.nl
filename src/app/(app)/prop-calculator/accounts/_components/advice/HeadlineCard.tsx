import { formatCurrency } from '~/lib/format';

import { type ReadyAdviceViewModel } from './adviceViewModel';

export function HeadlineCard({
    view,
}: {
    readonly view: ReadyAdviceViewModel;
}) {
    const { documented } = view;
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{view.headline}</h3>
            {documented === null ? (
                <p className="text-sm text-muted-foreground">
                    No documented sizing applies to this stage right now.
                </p>
            ) : (
                <p className="text-sm">
                    {documented.provenance}
                    {documented.rungs[0] !== undefined &&
                        `, first rung ${formatCurrency(documented.rungs[0].risk, 2)}`}
                </p>
            )}
        </div>
    );
}
