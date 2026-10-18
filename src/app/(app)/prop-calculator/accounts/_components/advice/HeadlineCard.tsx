import { PanelSubheading } from '~/components/PanelSubheading';
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
            <PanelSubheading className="first-letter:uppercase">
                {view.headline}
            </PanelSubheading>
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
