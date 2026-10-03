import { uncertainCurrencyText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { formatCurrency } from '~/lib/format';

import { PAYOUT_READY_LESSON_TEXT } from './accountActionModel';
import {
    type PayoutStakeView,
    type ValueSection,
    ValueSectionKind,
} from './adviceValueModel';
import { LiveTransferNotesList } from './LiveTransferNotesList';

const PAYOUT_HAZARD_LABEL = 'Live-transfer and payout-trigger assumptions behind the payout request';

export function PayoutReadyBanner({
    flag,
    stake,
}: {
    readonly flag: null | { readonly excess: number };
    readonly stake: null | ValueSection<PayoutStakeView>;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-md border p-4">
            <h3 className="text-base font-semibold">Request payout</h3>
            <p className="text-sm">
                This account can withdraw now. The documented rungs below are
                unchanged: being eligible to withdraw does not change today's
                sizing.
            </p>
            <p className="text-sm text-muted-foreground">
                {PAYOUT_READY_LESSON_TEXT}
            </p>
            {flag !== null && (
                <Alert variant="warning">
                    <AlertTitle>
                        Flag: risk above the documented rung
                    </AlertTitle>
                    <AlertDescription>
                        The risk you entered or recorded is{' '}
                        {formatCurrency(flag.excess, 2)} above the documented
                        rung while this account can withdraw.
                    </AlertDescription>
                </Alert>
            )}
            {stake !== null && <StakeLines stake={stake} />}
        </div>
    );
}

function StakeLines({
    stake,
}: {
    readonly stake: ValueSection<PayoutStakeView>;
}) {
    switch (stake.kind) {
        case ValueSectionKind.Failed: {
            return (
                <p className="text-sm text-muted-foreground">
                    EV at stake: Left out: {stake.reason}
                </p>
            );
        }
        case ValueSectionKind.NotModeled: {
            return (
                <p className="text-sm text-muted-foreground">
                    EV at stake is not modeled for this account.
                </p>
            );
        }
        case ValueSectionKind.Ready: {
            const { view } = stake;
            return (
                <div className="flex flex-col gap-1 text-sm">
                    <p className="font-medium">EV at stake</p>
                    <p>
                        Requesting now: {uncertainCurrencyText(view.requestNow)}
                    </p>
                    <p>Continuing: {uncertainCurrencyText(view.continueNow)}</p>
                    <p>
                        You receive {formatCurrency(view.traderReceivesNow, 2)}{' '}
                        now, net of the payout split.
                    </p>
                    {view.whatIf !== null && (
                        <p className="text-muted-foreground">
                            {view.whatIf.label}: continuing at{' '}
                            {formatCurrency(view.whatIf.risk, 2)} risk is worth{' '}
                            {uncertainCurrencyText(view.whatIf.value)}.
                        </p>
                    )}
                    <LiveTransferNotesList
                        label={PAYOUT_HAZARD_LABEL}
                        notes={view.liveTransferNotes}
                    />
                </div>
            );
        }
    }
}
