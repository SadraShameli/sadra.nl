import Link from 'next/link';

import {
    type AccountValueColumns,
    type AtRiskView,
    EvPerAttemptKind,
    type EvPerAttemptView,
    ExpectedPayoutsKind,
    type ExpectedPayoutsView,
    type NextActionView,
    NextPayoutKind,
    type NextPayoutView,
} from '~/app/(app)/prop-calculator/accounts/_components/accountValueColumns';
import { DisclosureTrigger } from '~/app/(app)/prop-calculator/accounts/_components/DisclosureTrigger';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
import { AccountAction } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const MUTED_NEXT_PAYOUT_KINDS: ReadonlySet<NextPayoutKind> = new Set([
    NextPayoutKind.NoPayout,
    NextPayoutKind.NotFunded,
    NextPayoutKind.NotValued,
    NextPayoutKind.Pending,
]);

export function ExpectedPayoutsFigure({
    expectedPayouts,
}: {
    readonly expectedPayouts: ExpectedPayoutsView;
}) {
    return (
        <>
            <ExpectedPayoutsValue expectedPayouts={expectedPayouts} />
            <ExpectedPayoutsReason expectedPayouts={expectedPayouts} />
        </>
    );
}

export function ExpectedPayoutsReason({
    expectedPayouts,
}: {
    readonly expectedPayouts: ExpectedPayoutsView;
}) {
    return expectedPayouts.kind === ExpectedPayoutsKind.NotValued ? (
        <p className="text-xs text-muted-foreground">
            {expectedPayouts.reason}
        </p>
    ) : null;
}

export function ExpectedPayoutsValue({
    expectedPayouts,
}: {
    readonly expectedPayouts: ExpectedPayoutsView;
}) {
    switch (expectedPayouts.kind) {
        case ExpectedPayoutsKind.NotValued: {
            return <div className="text-muted-foreground">Not valued</div>;
        }
        case ExpectedPayoutsKind.Pending: {
            return <span className="text-muted-foreground">Computing</span>;
        }
        case ExpectedPayoutsKind.Ready: {
            return <div className="font-medium">{expectedPayouts.text}</div>;
        }
    }
}

export function NextActionFigure({
    action,
}: {
    readonly action: NextActionView;
}) {
    return (
        <>
            <NextActionValue action={action} />
            {action.reason !== null && (
                <p className="text-xs text-muted-foreground">{action.reason}</p>
            )}
        </>
    );
}

export function NextActionValue({
    action,
}: {
    readonly action: NextActionView;
}) {
    return (
        <div className="font-medium" data-action={action.action}>
            {action.action === AccountAction.EnterSnapshot ? (
                <Link
                    className="underline underline-offset-4"
                    href={routes.propCalculator.accounts.review}
                >
                    {action.text}
                </Link>
            ) : (
                action.text
            )}
        </div>
    );
}

export function NextPayoutFigure({
    isNoteCollapsed = false,
    nextPayout,
}: {
    readonly isNoteCollapsed?: boolean;
    readonly nextPayout: NextPayoutView;
}) {
    const isNoteFolded =
        isNoteCollapsed && !MUTED_NEXT_PAYOUT_KINDS.has(nextPayout.kind);
    return (
        <>
            <NextPayoutValue nextPayout={nextPayout} />
            {nextPayout.note !== null &&
                (isNoteFolded ? (
                    <Collapsible className="flex flex-col text-xs text-muted-foreground">
                        <DisclosureTrigger className="text-xs">
                            How this is estimated
                        </DisclosureTrigger>
                        <CollapsibleContent>
                            <p>{nextPayout.note}</p>
                        </CollapsibleContent>
                    </Collapsible>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {nextPayout.note}
                    </p>
                ))}
        </>
    );
}

export function NextPayoutValue({
    nextPayout,
}: {
    readonly nextPayout: NextPayoutView;
}) {
    return (
        <span
            className={cn(
                MUTED_NEXT_PAYOUT_KINDS.has(nextPayout.kind) &&
                    'text-muted-foreground',
                nextPayout.isSoon && 'font-medium text-success',
            )}
            data-soon={nextPayout.isSoon ? 'true' : undefined}
        >
            {nextPayout.text}
        </span>
    );
}

export function ValueDetailLines({
    columns,
}: {
    readonly columns: AccountValueColumns;
}) {
    return (
        <>
            {columns.atRisk !== null && <AtRiskLine atRisk={columns.atRisk} />}
            {columns.evPerAttempt !== null && (
                <EvPerAttemptLines evPerAttempt={columns.evPerAttempt} />
            )}
        </>
    );
}

function AtRiskLine({ atRisk }: { readonly atRisk: AtRiskView }) {
    return (
        <div className="mt-1 text-xs">
            <p>{atRisk.text}</p>
            {atRisk.note !== null && (
                <p className="text-muted-foreground">{atRisk.note}</p>
            )}
        </div>
    );
}

function EvPerAttemptLines({
    evPerAttempt,
}: {
    readonly evPerAttempt: EvPerAttemptView;
}) {
    switch (evPerAttempt.kind) {
        case EvPerAttemptKind.Pending: {
            return (
                <p className="mt-1 text-xs text-muted-foreground">
                    EV per attempt: computing
                </p>
            );
        }
        case EvPerAttemptKind.Ready: {
            return (
                <div className="mt-1 text-xs">
                    <p>{evPerAttempt.text}</p>
                    <p className="text-muted-foreground">{evPerAttempt.note}</p>
                </div>
            );
        }
        case EvPerAttemptKind.Unavailable: {
            return (
                <p className="mt-1 text-xs text-muted-foreground">
                    EV per attempt is not available: {evPerAttempt.reason}
                </p>
            );
        }
    }
}
