import { type ArgsDef, parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    dpArguments,
    payoutCountRuleWarning,
    resolveDpPlan,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    fundedResetFlagDescription,
    planArguments,
    planVariant,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { simSummaryRows } from '~/cli/commands/prop/sim/command';
import { formatCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    describeFundedResetTerms,
    dollars,
    FirmId,
    FUNDED_RESET_MECHANICS,
    type Plan,
    simulate,
} from '~/lib/prop-calculator';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';

const ARGS = { ...planArguments, ...tradingArguments } satisfies ArgsDef;

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = new AlphaFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

function parseTradingInputs(argv: string[]): TradingInputs {
    return TradingInputs.parse(parseArgs<typeof ARGS>(argv, ARGS));
}

function resolvedDpPlan(argv: string[]): Plan {
    return resolveDpPlan(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('--funded-reset (N-34, T31: the Alpha Qualified Reset is an opt-in, off by default)', () => {
    it('is a boolean trading flag that defaults to off', () => {
        expect(tradingArguments['funded-reset']).toMatchObject({
            default: false,
            type: 'boolean',
        });
        expect(parseTradingInputs([]).takesFundedReset).toBe(false);
        expect(parseTradingInputs(['--funded-reset']).takesFundedReset).toBe(
            true,
        );
    });

    it('opts Alpha Zero into the reset only when the flag is set', () => {
        const zero = alphaPlan(AlphaFuturesVariant.Zero);

        expect(
            parseTradingInputs([]).toSimInputs(zero).plan.takesFundedReset,
        ).toBe(false);
        expect(
            parseTradingInputs(['--funded-reset']).toSimInputs(zero).plan
                .takesFundedReset,
        ).toBe(true);
    });

    it('leaves a plan without the reset untouched, so compare can pass the flag across every firm', () => {
        const advanced = alphaPlan(AlphaFuturesVariant.Advanced);

        expect(
            parseTradingInputs(['--funded-reset']).toSimInputs(advanced).plan,
        ).toBe(advanced);
    });

    it('bundles both opt-ins for the plan', () => {
        expect(
            parseTradingInputs([
                '--funded-reset',
                '--early-withdrawal',
            ]).toPlanOptIns(),
        ).toStrictEqual({
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        });
    });

    it('describes the reset, the opt-in and the cost in its help text, without em dashes', () => {
        const description = tradingArguments['funded-reset'].description;

        expect(description).toContain('Qualified Reset');
        expect(description).toContain('cost per funded account');
        expect(description).toContain(FUNDED_RESET_MECHANICS);
        expect(description).toContain('Off by default');
        expect(description).not.toContain('\u{2014}');
    });

    it('takes every price, count and window in its help text from the plan data, never a hard-coded copy', () => {
        const description = tradingArguments['funded-reset'].description;
        const offering = ALL_FIRMS.flatMap((firm) => firm.plans).filter(
            (plan) => plan.fundedReset !== null,
        );

        expect(offering.length).toBeGreaterThan(0);
        for (const plan of offering) {
            if (plan.fundedReset === null) continue;
            expect(description).toContain(
                `--firm ${plan.id.firm} --variant ${planVariant(plan)} at ${formatCurrency(plan.accountSize)} (${describeFundedResetTerms(plan.fundedReset)})`,
            );
        }
        expect(description).not.toContain('Alpha Futures Zero and Standard');
    });

    it('builds its help text from whatever plans it is given', () => {
        const zero = alphaPlan(AlphaFuturesVariant.Zero);
        const policy = zero.fundedReset;
        if (policy === null) throw new Error('Zero offers no funded reset');
        const repriced = zero.withOverrides({
            fundedReset: { ...policy, fee: dollars(123) },
        });

        const description = fundedResetFlagDescription([
            repriced,
            alphaPlan(AlphaFuturesVariant.Advanced),
        ]);

        expect(description).toContain('$123 each');
        expect(description).not.toContain('$499');
        expect(description).not.toContain('--variant advanced');
    });
});

describe('optimize dp takes --funded-reset and discloses that its DP does not model it (T31)', () => {
    it('opts the plan in, so the FundedResetNotModeled gap line prints', () => {
        const plan = resolvedDpPlan([
            '--firm',
            'alphafutures',
            '--variant',
            'zero',
            '--funded-reset',
        ]);

        expect(plan.takesFundedReset).toBe(true);
        expect(payoutCountRuleWarning(plan)).toContain(
            'takes the funded reset',
        );
    });

    it('keeps both opt-ins independent and off by default', () => {
        const plan = resolvedDpPlan(['--firm', 'alphafutures', '--variant', 'zero']);

        expect(plan.takesFundedReset).toBe(false);
        expect(payoutCountRuleWarning(plan) ?? '').not.toContain(
            'takes the funded reset',
        );
        expect(
            resolvedDpPlan([
                '--firm',
                'mffu',
                '--variant',
                'pro',
                '--early-withdrawal',
                '--funded-reset',
            ]).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });
});

describe('prop sim shows the funded reset rows only when a reset happened', () => {
    const zero = alphaPlan(AlphaFuturesVariant.Zero);
    const base = {
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        riskPerTrade: 1000,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 2,
        trials: 50,
        winrate: 0.45,
    };

    it('omits them without the opt-in', () => {
        const labels = simSummaryRows(simulate({ ...base, plan: zero })).map(
            ([label]) => label,
        );
        expect(labels).not.toContain('funded resets / acct');
        expect(labels).not.toContain('funded reset fees');
    });

    it('prints the count and the fees with the opt-in', () => {
        const out = simulate({
            ...base,
            plan: parseTradingInputs(['--funded-reset']).toSimInputs(zero).plan,
        });
        expect(out.expectedFundedResets).toBeGreaterThan(0);
        const rows = new Map(simSummaryRows(out));
        expect(rows.get('funded resets / acct')).toBe(
            out.expectedFundedResets.toFixed(2),
        );
        expect(rows.get('funded reset fees')).toBe(
            formatCurrency(out.costBreakdown.fundedResetFeesTotal),
        );
    });
});
