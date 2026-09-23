import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import optimizeDp, {
    dpArguments,
    empiricalSummaryLines,
    fundedIneligibilityMessage,
    payoutCountRuleWarning,
    readDpInputs,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type SimOutputs,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    FtmoFuturesVariant,
    FundedNextVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { isFundedDpEligible } from '~/lib/prop-calculator/core/FundedStateValue';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { FtmoFutures } from '~/lib/prop-calculator/firms/ftmo-futures/FtmoFutures';
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

    it('no longer lists a terminating daily loss limit, only the continuously peak-scaled one', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).not.toContain('terminating');
        expect(message).toContain('PeakProfitShare');
    });

    it('FTMO Futures Pro 50K, whose funded daily loss limit terminates the account, is now DP-eligible', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Pro,
        });
        if (!plan) throw new Error('FTMO Futures Pro 50K plan not found');
        expect(plan.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            true,
        );
        expect(isFundedDpEligible(plan)).toBe(true);
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

    it('warns that MFF Pro’s payout-triggered lock lets the pre-lock floor trail past the DP offset grid', () => {
        const warning = payoutCountRuleWarning(mffProPlan());
        expect(warning).toContain(
            'locks its funded drawdown only on the first payout',
        );
        expect(warning).toContain('saturate');
        expect(warning).toContain('understates the balance');
        expect(warning).toContain('pessimistic');
        expect(warning).not.toContain('slightly optimistic');
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

function parseDpInputs(argv: string[]) {
    return readDpInputs(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('optimize dp flag bounds', () => {
    it.each([
        ['winrate', '40', /--winrate must be a fraction in \[0, 1\]/],
        ['trials', '0', /--trials must be a whole number >= 1/],
        ['seed', '1.5', /--seed must be a whole number/],
        ['rr', '0', /--rr must be a number > 0/],
        ['eval-days', '0', /--eval-days must be a whole number >= 1/],
        ['funded-days', '0', /--funded-days must be a whole number >= 1/],
        ['iterations', '2.5', /--iterations must be a whole number >= 1/],
    ])('rejects --%s %s, naming the flag', (flag, value, message) => {
        expect(() => parseDpInputs([`--${flag}=${value}`])).toThrow(message);
    });

    it('reads the defaults', () => {
        expect(parseDpInputs([])).toStrictEqual({
            fundedHorizonDays: 252,
            maxEvalDays: 40,
            maxSolves: 8,
            rebuyLagDays: 0,
            rrRatio: 2,
            seed: 42,
            trials: 4000,
            winrate: 0.4,
        });
    });
});

describe('optimize dp empirical summary (D2)', () => {
    const base = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: apexEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.5,
    });
    const out: SimOutputs = {
        ...base,
        evalPassProbability: 0.8,
        fundedSurvivalProbability: 0.1,
    };
    const lines = empiricalSummaryLines(out, out.expectedMonthlyNet);

    it('labels the eval pass rate from evalPassProbability', () => {
        expect(lines).toContain('eval pass rate: 80.0%');
    });

    it('adds the funded survive rate as its own line', () => {
        expect(lines).toContain('funded survive: 10.0%');
    });

    it('reports a zero gap when the empirical monthly net equals the DP rate', () => {
        expect(lines).toContain('gap vs DP-predicted monthly rate: $0');
    });
});
