import { describe, expect, it } from 'vitest';

import { describeFirstPayoutGate } from '~/app/(app)/prop-calculator/_components/firstPayoutGate';
import {
    dollars,
    FirmId,
    FundedNextVariant,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const legacy = planFor({
    accountSize: 50_000,
    firm: FirmId.FundedNext,
    variant: FundedNextVariant.Legacy,
});

const mffPro = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});

describe('describeFirstPayoutGate', () => {
    it("shows MFF Pro's calendar-day gate in its own unit and the first-payout profit gate (N-7)", () => {
        expect(describeFirstPayoutGate(mffPro)).toBe(
            '14 calendar days from first trade, restarting at each payout · $2.1K buffer',
        );
    });

    it("shows FundedNext Legacy's $500 per-cycle gate, which a $0 first-payout gate alone hides (N-42)", () => {
        expect(describeFirstPayoutGate(legacy)).toBe(
            '5 qualifying days · $0 buffer · $500/cycle',
        );
    });

    it('prints a sub-dollar per-cycle gate in cents instead of rounding it to $0', () => {
        const centGate = legacy.withOverrides({
            minPayoutProfitPerCycle: dollars(0.01),
        });

        expect(describeFirstPayoutGate(centGate)).toBe(
            '5 qualifying days · $0 buffer · $0.01/cycle',
        );
    });
});
