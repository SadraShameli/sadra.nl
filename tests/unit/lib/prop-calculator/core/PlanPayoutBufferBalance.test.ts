import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    FundedNextVariant,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const BUFFER_COPY_FILES = [
    'src/lib/prop-calculator/core/Plan.ts',
    'src/lib/prop-calculator/describe/PlanRuleDescriptions.ts',
    'src/lib/prop-calculator/advisor/LiveTransitionPreview.ts',
    'src/lib/prop-calculator/simulator/LiveTransfer.ts',
] as const;

function fundedNextPlan(variant: FundedNextVariant) {
    const plan = new FundedNext().findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant,
    });
    if (!plan) throw new Error(`FundedNext ${variant} 50K plan not found`);
    return plan;
}

function requiredBalanceCalls(): number {
    return BUFFER_COPY_FILES.reduce((total, relativePath) => {
        const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        return total + (text.match(/\.requiredBalance\(/g) ?? []).length;
    }, 0);
}

describe('Plan.payoutBufferBalance (PT-73c)', () => {
    it('is the documented $52,100 buffer level for FundedNext Rapid Daily at 50K', () => {
        expect(
            fundedNextPlan(FundedNextVariant.RapidDaily).payoutBufferBalance(),
        ).toBe(52_100);
    });

    it('equals the buffer helper applied to the plan own account size and funded drawdown', () => {
        const plan = fundedNextPlan(FundedNextVariant.RapidDaily);

        expect(plan.payoutBufferBalance()).toBe(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        );
    });

    it('is null for a plan without a payout buffer', () => {
        expect(
            fundedNextPlan(FundedNextVariant.RapidPro).payoutBufferBalance(),
        ).toBeNull();
        const mffuPlan = new MyFundedFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        expect(mffuPlan?.payoutBufferBalance()).toBeNull();
    });

    it('feeds the payout balance floor, which stays the higher of the buffer and the cushion floor', () => {
        const plan = fundedNextPlan(FundedNextVariant.RapidDaily);
        const state = plan.initialState();
        state.threshold = 50_100;

        expect(plan.payoutBalanceFloor(state, 0)).toBe(
            plan.payoutBufferBalance(),
        );
        expect(plan.payoutBalanceFloor(state, 3000)).toBe(
            dollars(53_100),
        );
    });
});

describe('payout buffer derivation duplication (PT-73c)', () => {
    it('computes the required balance from the buffer in exactly one place', () => {
        expect(requiredBalanceCalls()).toBe(1);
    });
});
