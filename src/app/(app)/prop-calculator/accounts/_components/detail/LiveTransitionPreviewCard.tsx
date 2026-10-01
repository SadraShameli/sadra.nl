import { useMemo } from 'react';

import { type Plan } from '~/lib/prop-calculator';
import {
    liveTransitionPreview,
    type ReconstructedAccount,
} from '~/lib/prop-calculator/advisor';

import { liveTransitionPreviewCardOf } from './liveTransitionPreviewModel';

export function LiveTransitionPreviewCard({
    account,
    plan,
}: {
    readonly account: ReconstructedAccount;
    readonly plan: Plan;
}) {
    const model = useMemo(
        () => liveTransitionPreviewCardOf(liveTransitionPreview(plan, account)),
        [account, plan],
    );
    return (
        <div className="flex flex-col gap-2 text-sm">
            <p>{model.headline}</p>
            {model.lines.map((line) => (
                <p className="text-muted-foreground" key={line}>
                    {line}
                </p>
            ))}
            {model.caveats.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
                    {model.caveats.map((caveat) => (
                        <li key={caveat}>{caveat}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
