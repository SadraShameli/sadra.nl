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
            '14 calendar days from first trade, restarting at each payout · $2.1K profit',
        );
    });

    it("shows FundedNext Legacy's $500 gate on the first payout and on every cycle as profit, not a buffer (N-42, N-93)", () => {
        expect(describeFirstPayoutGate(legacy)).toBe(
            '5 qualifying days · $500 profit · $500/cycle',
        );
    });

    it('appends the payout buffer balance gate for FundedNext Rapid Daily (PT-73c)', () => {
        const rapidDaily = planFor({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.RapidDaily,
        });

        expect(describeFirstPayoutGate(rapidDaily)).toMatch(
            / · balance at least \$52\.1K$/,
        );
    });

    it('prints a sub-dollar per-cycle gate in cents instead of rounding it to $0', () => {
        const centGate = legacy.withOverrides({
            minPayoutProfitPerCycle: dollars(0.01),
        });

        expect(describeFirstPayoutGate(centGate)).toBe(
            '5 qualifying days · $500 profit · $0.01/cycle',
        );
    });
});
