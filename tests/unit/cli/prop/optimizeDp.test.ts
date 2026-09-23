import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import optimizeDp, {
    fundedIneligibilityMessage,
    payoutCountRuleWarning,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    MffuVariant,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { FundedNextVariant } from '~/lib/prop-calculator/core';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

function apexEodPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function apexIntradayPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function findE8SignaturePlan(): Plan {
    const plan = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!plan) throw new Error('E8 Signature 50K plan not found');
    return plan;
}

function legacyPlan(): Plan {
    const plan = new FundedNext().findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
    return plan;
}

function mffBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

function mffProPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
}

function topStepNoFeeStandardPlan(): Plan {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    return plan;
}

describe('fundedIneligibilityMessage', () => {
    it('names the cumulative-qualifying-days payout cap as a reason, for FundedNext Legacy', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).toContain('QualifyingDaysMilestonePayoutCap');
        expect(message).toContain('cumulative qualifying days');
    });
});

describe('payoutCountRuleWarning', () => {
    it('returns null for Apex EOD: its payoutLadder (6 steps) and maxLifetimePayouts (6) both fit inside the DP payout-count regime cap of 6', () => {
        expect(payoutCountRuleWarning(apexEodPlan())).toBeNull();
    });

    it('returns null for Apex Intraday, for the same reason as EOD', () => {
        expect(payoutCountRuleWarning(apexIntradayPlan())).toBeNull();
    });

    it('returns null for E8 Signature: its tiered payout cap tiers (0, 2, 4) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(payoutCountRuleWarning(findE8SignaturePlan())).toBeNull();
    });

    it('returns null for MFF Builder: its payoutLadder (5 steps) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(payoutCountRuleWarning(mffBuilderPlan())).toBeNull();
    });

    it('returns null for TopStep no-fee-standard: it has no count-keyed payout rule at all', () => {
        expect(payoutCountRuleWarning(topStepNoFeeStandardPlan())).toBeNull();
    });

    it('warns about MFF Pro’s $100,000 lifetime payout-dollar cap and says this DP ignores it (optimistic)', () => {
        const warning = payoutCountRuleWarning(mffProPlan());
        expect(warning).not.toBeNull();
        expect(warning).toContain('$100,000');
        expect(warning).toContain('maxLifetimePayoutDollars');
        expect(warning).toContain('ignores');
        expect(warning).toContain('cumulativePayout');
    });

    it('warns about a PayoutCountTieredPayoutCap tier beyond the regime cap and says it saturates', () => {
        const plan = topStepNoFeeStandardPlan().withOverrides({
            payoutBalanceShareCap: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1000),
                    },
                },
                {
                    fromPayoutIndex: 9,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(2000),
                    },
                },
            ]),
            payoutRequestCap: undefined,
        });

        const warning = payoutCountRuleWarning(plan);
        expect(warning).not.toBeNull();
        expect(warning).toContain('payout #10');
        expect(warning).toContain('regime cap of 6');
        expect(warning).toContain('saturate');
    });
});

async function resolveArguments(): Promise<ArgsDef> {
    const resolvable = optimizeDp.args;
    if (!resolvable) throw new Error('optimize dp command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

describe('optimize dp arguments', () => {
    it('defaults --rebuy-lag-days to 0', async () => {
        const arguments_ = await resolveArguments();
        const parsed = parseArgs([], arguments_);
        expect(parsed['rebuy-lag-days']).toBe('0');
    });

    it('still exposes --iterations as max rate-search solves', async () => {
        const arguments_ = await resolveArguments();
        expect(arguments_.iterations).toBeDefined();
        const parsed = parseArgs([], arguments_);
        expect(parsed.iterations).toBe('8');
    });
});
