import { describe, expect, it } from 'vitest';

import { PayoutGate } from '~/lib/prop-calculator';
import {
    liveTriggerCountText,
    type LiveTriggerInfo,
    LiveTriggerScope,
    payoutBlockReasonFromGate,
    PayoutBlockReasonKind,
    payoutPendingBlockReason,
    wouldTriggerLiveBlockReason,
} from '~/lib/prop-calculator/advisor';

describe('PayoutBlockReason: every PayoutGate member maps to a Gate reason', () => {
    it.each(Object.values(PayoutGate))('wraps %s', (gate) => {
        expect(payoutBlockReasonFromGate(gate)).toEqual({
            gate,
            kind: PayoutBlockReasonKind.Gate,
        });
    });

    it('builds the PayoutPending reason with no extra data', () => {
        expect(payoutPendingBlockReason()).toEqual({
            kind: PayoutBlockReasonKind.PayoutPending,
        });
    });

    it('builds the WouldTriggerLive reason only when trigger data is supplied', () => {
        const trigger: LiveTriggerInfo = {
            payoutsTaken: 9,
            scope: LiveTriggerScope.Firm,
            triggerAtPayoutCount: 10,
        };
        expect(wouldTriggerLiveBlockReason(trigger)).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger,
        });
    });
});

describe('liveTriggerCountText (PT-36d)', () => {
    it('names the account scope from the typed fields', () => {
        expect(
            liveTriggerCountText({
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            }),
        ).toBe('2 of 3 payouts taken on this account');
    });

    it("names the firm scope and the 'since the last live account' basis only for a firm-wide count", () => {
        expect(
            liveTriggerCountText({
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 10,
            }),
        ).toBe(
            "9 of 10 payouts taken across the firm's accounts since the last live account",
        );
    });
});
