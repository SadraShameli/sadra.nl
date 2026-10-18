import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FundedOptimizerCalculatorInputs } from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import type * as PropCalculatorModule from '~/lib/prop-calculator';
import type { Plan } from '~/lib/prop-calculator/core';

const box = vi.hoisted(() => ({
    accountPolicy: null as null | PropCalculatorModule.FirmAccountPolicy,
}));

vi.mock('~/lib/prop-calculator', async (importOriginal) => {
    const actual = await importOriginal<typeof PropCalculatorModule>();
    return {
        ...actual,
        findFirm: (id: unknown) => {
            const firm = actual.findFirm(id as never);
            return firm === undefined ||
                id !== actual.FirmId.TopStep ||
                box.accountPolicy === null
                ? firm
                : (Object.assign(
                      Object.create(Object.getPrototypeOf(firm) as object),
                      firm,
                      { accountPolicy: box.accountPolicy },
                  ) as PropCalculatorModule.TradingFirm);
        },
    };
});

const { defaultCalculatorState } =
    await import('~/app/(app)/prop-calculator/_components/calculatorReducer');
const { fundedOptimizerRequest } =
    await import('~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel');
const {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    LifetimePayoutCapOverrideKind,
    serializePlanId,
} = await import('~/lib/prop-calculator');
const { DEFAULT_RULEBOOK, LifetimePayoutCapBasis } =
    await import('~/lib/prop-calculator/advisor');
const { TopStepVariant } = await import('~/lib/prop-calculator/core');

class VerifiedCountTriggerPolicy extends FirmAccountPolicy {
    override lifetimePayoutCapOverride() {
        return { cap: 5, kind: LifetimePayoutCapOverrideKind.Capped } as const;
    }
}

class VerifiedNoCountTriggerPolicy extends FirmAccountPolicy {
    override lifetimePayoutCapOverride() {
        return { kind: LifetimePayoutCapOverrideKind.NoCountTrigger } as const;
    }
}

function baseInputs(): FundedOptimizerCalculatorInputs {
    const state = defaultCalculatorState();
    const plan = requirePlan(
        findFirm(FirmId.TopStep)?.findPlanBySerial(
            serializePlanId({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        ),
        'expected the TopStep 50K Standard/Standard plan to resolve',
    );
    return { ...state, plan };
}

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

describe('fundedOptimizerRequest names the lifetime payout cap basis (PT-25c)', () => {
    afterEach(() => {
        box.accountPolicy = null;
    });

    it('reports not-yet-checked when the firm carries no account policy override', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.LiveTriggersNotChecked,
        );
        expect(request.policy.lifetimePayoutCapOverride).toBeNull();
    });

    it('reports a verified no-count trigger from the firm account policy', () => {
        box.accountPolicy = new VerifiedNoCountTriggerPolicy();
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.VerifiedNoCountTrigger,
        );
        expect(request.policy.lifetimePayoutCapOverride).toBeNull();
    });

    it('reports a verified count trigger and its cap from the firm account policy', () => {
        box.accountPolicy = new VerifiedCountTriggerPolicy();
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.VerifiedCountTrigger,
        );
        expect(request.policy.lifetimePayoutCapOverride).toBe(5);
    });
});
