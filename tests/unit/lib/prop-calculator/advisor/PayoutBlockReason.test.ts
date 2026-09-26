import { describe, expect, it } from 'vitest';

import { PayoutGate } from '~/lib/prop-calculator';
import {
    type LiveTriggerInfo,
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
            paidPayoutsSinceLastLiveAccount: 9,
            triggerAtPayoutCount: 10,
        };
        expect(wouldTriggerLiveBlockReason(trigger)).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger,
        });
    });
});
