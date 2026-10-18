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
import { ComputingFigure } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { MissingValue } from '~/components/MissingValue';
import { Badge } from '~/components/ui/badge';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
import InfoPopover from '~/components/ui/info-popover';
import { AccountAction } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const MUTED_NEXT_PAYOUT_KINDS: ReadonlySet<NextPayoutKind> = new Set([
    NextPayoutKind.NoPayout,
    NextPayoutKind.NotFunded,
]);

const EV_PER_ATTEMPT_LABEL = 'EV per attempt:';

const NEXT_PAYOUT_SOON_LABEL = 'Soon';

const NEXT_ACTION_REASON_TITLE = 'Why this action';

export function ExpectedPayoutsValue({
    expectedPayouts,
}: {
    readonly expectedPayouts: ExpectedPayoutsView;
}) {
    switch (expectedPayouts.kind) {
        case ExpectedPayoutsKind.NotValued: {
            return <MissingValue reason={sentenceOf(expectedPayouts.reason)} />;
        }
        case ExpectedPayoutsKind.Pending: {
            return <ComputingFigure />;
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
        <span className="inline-flex items-center gap-1.5">
            <NextActionValue action={action} />
            {action.reason !== null && (
                <InfoPopover title={NEXT_ACTION_REASON_TITLE}>
                    {sentenceOf(action.reason)}
                </InfoPopover>
            )}
        </span>
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
    switch (nextPayout.kind) {
        case NextPayoutKind.InDays:
        case NextPayoutKind.NoPayout:
        case NextPayoutKind.NotFunded:
        case NextPayoutKind.Now: {
            break;
        }
        case NextPayoutKind.NotValued: {
            return <MissingValue reason={sentenceOf(nextPayout.text)} />;
        }
        case NextPayoutKind.Pending: {
            return <ComputingFigure />;
        }
    }
    if (nextPayout.isSoon) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
                <span data-soon="true">{nextPayout.text}</span>
                <Badge>{NEXT_PAYOUT_SOON_LABEL}</Badge>
            </span>
        );
    }
    return (
        <span
            className={cn(
                MUTED_NEXT_PAYOUT_KINDS.has(nextPayout.kind) &&
                    'text-muted-foreground',
            )}
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
                <div className="mt-1 text-xs text-muted-foreground">
                    {EV_PER_ATTEMPT_LABEL} <ComputingFigure />
                </div>
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
                    {EV_PER_ATTEMPT_LABEL}{' '}
                    <MissingValue reason={sentenceOf(evPerAttempt.reason)} />
                </p>
            );
        }
    }
}
