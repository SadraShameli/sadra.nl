import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
    describeFundedContracts,
    describeShare,
    describeStopRule,
    formatDaysToPass,
    hasEvalPass,
    MAX_PATH_GRANULARITY,
    planArguments,
    planResolver,
    readFraction,
    readGranularityList,
    readInteger,
    readLadder,
    readMaxLifetimePayouts,
    readNonNegativeInteger,
    readNonNegativeNumber,
    readNumberList,
    readPercent,
    readPercentAsFraction,
    readPositiveInteger,
    readPositiveNumber,
    readRebuyLagDays,
    readStopRule,
    singlePathGranularityArgument,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import * as sharedModule from '~/cli/commands/prop/shared';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    AlphaFuturesVariant,
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    type DayStopRule,
    DayStopRuleKind,
    E8FuturesVariant,
    findFirm,
    FirmId,
    fraction,
    percent,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';

const ARGS = {
    ...planArguments,
    ...tradingArguments,
    ...singlePathGranularityArgument,
} satisfies ArgsDef;

function registryPlan() {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant: 'rapid-eod' });
}

describe('--rebuy-lag-days', () => {
    it('threads a parsed value through TradingInputs into SimInputs', () => {
        const parsed = parseArgs<typeof ARGS>(['--rebuy-lag-days', '2'], ARGS);
        const inputs = TradingInputs.parse(parsed);
        const simInputs = inputs.toSimInputs(registryPlan());
        expect(simInputs.rebuyLagDays).toBe(2);
    });

    it('defaults to 0 when the flag is omitted', () => {
        const parsed = parseArgs<typeof ARGS>([], ARGS);
        const inputs = TradingInputs.parse(parsed);
        const simInputs = inputs.toSimInputs(registryPlan());
        expect(simInputs.rebuyLagDays).toBe(0);
    });

    it('rejects a negative value, naming the flag', () => {
        expect(() => readRebuyLagDays('-1')).toThrow(/--rebuy-lag-days/);
    });

    it('rejects a non-numeric value, naming the flag', () => {
        expect(() => readRebuyLagDays('abc')).toThrow(/--rebuy-lag-days/);
    });
});

function apexEodPlan(): Plan {
    return findRegistryPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
}

function findRegistryPlan(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan ${JSON.stringify(planId)} not found`);
    return plan;
}

function parseTradingInputs(argv: string[]): TradingInputs {
    return TradingInputs.parse(parseArgs<typeof ARGS>(argv, ARGS));
}

function signatureFuturesPlan(): Plan {
    return findRegistryPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
}

describe('flag bounds', () => {
    it.each([
        ['winrate', '40'],
        ['winrate', '1.01'],
        ['winrate', '-0.1'],
        ['eval-discount', '150'],
        ['eval-discount', '-5'],
        ['activation-discount', '200'],
        ['monthly-discount', '101'],
        ['idle-day-probability', '5'],
        ['risk', '-250'],
        ['risk', '0'],
        ['funded-risk', '0'],
        ['rr', '0'],
        ['funded-rr', '0'],
        ['tpd', '2.5'],
        ['funded-tpd', '0'],
        ['copy-accounts', '0'],
        ['copy-accounts', '1.5'],
        ['max-attempts', '0'],
        ['eval-days', '0'],
        ['funded-days', '-1'],
        ['funded-days', '2.5'],
        ['commission', '-1'],
        ['retain-cushion', '-1'],
        ['seed', '1.5'],
        ['request-size', '0'],
        ['stop-points', '0'],
        ['risk', 'Infinity'],
        ['winrate', 'abc'],
    ])('rejects --%s %s, naming the flag', (flag, value) => {
        expect(() => parseTradingInputs([`--${flag}=${value}`])).toThrow(
            new RegExp(`--${flag} must be .*, got "${value}"`),
        );
    });

    it('explains the winrate scale when given a percent', () => {
        expect(() => parseTradingInputs(['--winrate', '40'])).toThrow(
            /fraction in \[0, 1\]/,
        );
    });

    it('accepts the winrate boundaries 0 and 1', () => {
        expect(
            parseTradingInputs(['--winrate', '0']).toSimInputs(apexEodPlan())
                .winrate,
        ).toBe(0);
        expect(
            parseTradingInputs(['--winrate', '1']).toSimInputs(apexEodPlan())
                .winrate,
        ).toBe(1);
    });

    it('accepts a 100% eval discount', () => {
        const simInputs = parseTradingInputs([
            '--eval-discount',
            '100',
        ]).toSimInputs(apexEodPlan());
        expect(simInputs.discounts?.evalPercent).toBe(100);
    });

    it('leaves discounts undefined when every discount is 0', () => {
        const simInputs = parseTradingInputs([
            '--activation-discount',
            '0',
            '--eval-discount',
            '0',
            '--monthly-discount',
            '0',
        ]).toSimInputs(apexEodPlan());
        expect(simInputs.discounts).toBeUndefined();
    });

    it('accepts an idle-day probability of 1', () => {
        expect(
            parseTradingInputs(['--idle-day-probability', '1']).toSimInputs(
                apexEodPlan(),
            ).idleDayProbability,
        ).toBe(1);
    });

    it('keeps --funded-days 0 legal for an eval-only study', () => {
        expect(
            parseTradingInputs(['--funded-days', '0']).toSimInputs(
                apexEodPlan(),
            ).fundedHorizonDays,
        ).toBe(0);
    });

    it('rejects the boolean citty yields for an undeclared flag', () => {
        expect(() => readFraction(true, 'idle-day-probability')).toThrow(
            /--idle-day-probability must be a fraction in \[0, 1\]/,
        );
    });

    it('rejects empty and infinite positive numbers', () => {
        expect(() => readPositiveNumber('', 'risk')).toThrow(/--risk/);
        expect(() => readPositiveNumber('Infinity', 'risk')).toThrow(/--risk/);
    });

    it('converts a percent flag to a fraction', () => {
        expect(readPercentAsFraction('5', 'x')).toBe(0.05);
        expect(readPercentAsFraction('0', 'x')).toBe(0);
        expect(readPercentAsFraction('100', 'x')).toBe(1);
        expect(() => readPercentAsFraction('101', 'x')).toThrow(
            /--x must be a percent in \[0, 100\]/,
        );
    });

    it.each(['-1', '101', 'abc', ''])(
        'names --cushion-percent-pre-lock when rejecting %s',
        (value) => {
            expect(() =>
                readPercentAsFraction(value, 'cushion-percent-pre-lock'),
            ).toThrow(
                /--cushion-percent-pre-lock must be a percent in \[0, 100\]/,
            );
        },
    );

    it('rejects a negative --commission for the trading commands', () => {
        expect(() => parseTradingInputs(['--commission=-5'])).toThrow(
            /--commission must be a number >= 0/,
        );
    });

    it('keeps the trading --idle-day-probability and --commission defaults at 0', () => {
        const parsed = parseTradingInputs([]);
        expect(parsed.idleDayProbability).toBe(0);
        expect(parsed.commissionPerRoundTrip).toBe(0);
    });

    it('makes the numeric readers reject booleans and empty strings', () => {
        expect(() => readNonNegativeNumber(true, 'x')).toThrow(/--x/);
        expect(() => readNonNegativeNumber('', 'x')).toThrow(/--x/);
        expect(readNonNegativeNumber('2.5', 'x')).toBe(2.5);
    });

    it('no longer exports the unbounded readNumber reader', () => {
        expect('readNumber' in sharedModule).toBe(false);
    });

    it('covers the remaining integer readers', () => {
        expect(readPositiveInteger('3', 'x')).toBe(3);
        expect(readNonNegativeInteger('0', 'x')).toBe(0);
        expect(() => readNonNegativeInteger('-1', 'x')).toThrow(
            /--x must be a whole number >= 0/,
        );
        expect(readInteger('-7', 'x')).toBe(-7);
        expect(readNonNegativeNumber('0', 'x')).toBe(0);
        expect(readPercent('55', 'x')).toBe(55);
    });
});

describe('--trials', () => {
    it.each(['0', '-1', '0.5', 'abc'])('rejects --trials %s', (value) => {
        expect(() => parseTradingInputs([`--trials=${value}`])).toThrow(
            /--trials must be a whole number >= 1/,
        );
    });

    it('accepts a single trial', () => {
        expect(
            parseTradingInputs(['--trials', '1']).toSimInputs(apexEodPlan())
                .trials,
        ).toBe(1);
    });

    it('defaults to 4000 trials', () => {
        expect(parseTradingInputs([]).toSimInputs(apexEodPlan()).trials).toBe(
            4000,
        );
    });
});

describe('--stop parsing (readStopRule)', () => {
    it.each<[string, DayStopRule]>([
        [
            'after-target:500',
            { dollars: 500, kind: DayStopRuleKind.AfterTarget },
        ],
        [
            'after-target:$500',
            { dollars: 500, kind: DayStopRuleKind.AfterTarget },
        ],
        [
            'after-target:1250.5',
            { dollars: 1250.5, kind: DayStopRuleKind.AfterTarget },
        ],
        ['after-target', { dollars: 500, kind: DayStopRuleKind.AfterTarget }],
        ['after-k-losses:3', { k: 3, kind: DayStopRuleKind.AfterKLosses }],
        ['after-k-losses', { k: 2, kind: DayStopRuleKind.AfterKLosses }],
        ['day-green', { kind: DayStopRuleKind.DayGreen }],
        ['first-win', { kind: DayStopRuleKind.FirstWin }],
        ['none', { kind: DayStopRuleKind.None }],
    ])('accepts %s', (raw, expected) => {
        expect(readStopRule(raw)).toStrictEqual(expected);
    });

    it.each([
        'after-target:abc',
        'after-target:',
        'after-target:$',
        'after-target:00',
        'after-target:-100',
        'after-target:500:1',
        'after-k-losses:notanumber',
        'after-k-losses:0',
        'after-k-losses:1.5',
        'day-green:5',
        'bogus',
    ])('rejects %s, naming --stop and the raw value', (raw) => {
        expect(() => readStopRule(raw)).toThrow('--stop');
        expect(() => readStopRule(raw)).toThrow(raw);
    });

    it('tells the user to single-quote a $ target the shell expanded', () => {
        expect(() => readStopRule('after-target:00')).toThrow('single-quote');
    });

    it('wires a $ target through TradingInputs into SimInputs', () => {
        expect(
            parseTradingInputs(['--stop', 'after-target:$500']).toSimInputs(
                apexEodPlan(),
            ).dayStop,
        ).toStrictEqual({ dollars: 500, kind: DayStopRuleKind.AfterTarget });
    });

    it('fails TradingInputs.parse on a malformed stop rule', () => {
        expect(() =>
            parseTradingInputs(['--stop', 'after-k-losses:abc']),
        ).toThrow(/--stop/);
    });

    it.each([
        'none',
        'day-green',
        'first-win',
        'after-target:$500',
        'after-k-losses:2',
    ])('round-trips %s through describeStopRule', (form) => {
        expect(describeStopRule(readStopRule(form))).toBe(form);
    });
});

describe('--ladder parsing', () => {
    it.each(['400,,600', '400, ,600'])('rejects %s as empty entry 2', (raw) => {
        expect(() => readLadder(raw)).toThrow(/entry 2 is empty/);
    });

    it.each([',400,600', '400,600,'])('rejects %s as empty', (raw) => {
        expect(() => readLadder(raw)).toThrow(/is empty/);
    });

    it('rejects a positive rung after a $0 rung', () => {
        expect(() => readLadder('400,0,600')).toThrow(
            /rung 3 follows a \$0 rung/,
        );
    });

    it.each(['0', '0,400'])('rejects %s as a zero first rung', (raw) => {
        expect(() => readLadder(raw)).toThrow(/first rung must be > 0/);
    });

    it.each(['400,-1', '400,abc'])('rejects %s', (raw) => {
        expect(() => readLadder(raw)).toThrow(/--ladder/);
    });

    it.each<[string, number[]]>([
        ['400,600', [400, 600]],
        [' 400 , 600 ', [400, 600]],
        ['400,600,0', [400, 600, 0]],
    ])('accepts %s', (raw, expected) => {
        expect(readLadder(raw)).toStrictEqual(expected);
    });

    it('returns null when omitted or empty', () => {
        expect(readLadder(undefined)).toBeNull();
        expect(readLadder('')).toBeNull();
    });

    it('names the flag it was given', () => {
        expect(() => readLadder('400,,600', 'funded-ladder')).toThrow(
            '--funded-ladder',
        );
        expect(() => readLadder('400,,600', 'funded-ladder')).not.toThrow(
            '--ladder "',
        );
    });

    it('wires through TradingInputs', () => {
        expect(() => parseTradingInputs(['--ladder', '400,,600'])).toThrow(
            /--ladder/,
        );
        expect(
            parseTradingInputs(['--ladder', '400,600']).toDayPolicy()?.ladder,
        ).toStrictEqual([400, 600]);
    });
});

describe('readNumberList', () => {
    it('parses every entry through the item schema', () => {
        expect(readNumberList('1,2', 'x', z.number(), 'n')).toStrictEqual([
            1, 2,
        ]);
    });

    it('rejects an empty entry, naming the flag and position', () => {
        expect(() => readNumberList('1,,2', 'x', z.number(), 'n')).toThrow(
            /--x.*entry 2 is empty/,
        );
    });

    it('rejects an entry the item schema refuses', () => {
        expect(() =>
            readNumberList('1,-2', 'x', z.number().positive(), 'a number > 0'),
        ).toThrow(/--x.*entry 2 must be a number > 0/);
    });
});

describe('readMaxLifetimePayouts', () => {
    it('returns undefined when omitted or empty', () => {
        expect(readMaxLifetimePayouts(undefined)).toBeUndefined();
        expect(readMaxLifetimePayouts('')).toBeUndefined();
    });

    it.each(['unlimited', 'none', 'UNLIMITED', 'None', ' unlimited '])(
        'treats %s as no cap',
        (raw) => {
            expect(readMaxLifetimePayouts(raw)).toBeNull();
        },
    );

    it('reads a whole number of payouts', () => {
        expect(readMaxLifetimePayouts('3')).toBe(3);
    });

    it.each(['0', '-1', '2.5', 'abc'])('rejects %s', (raw) => {
        expect(() => readMaxLifetimePayouts(raw)).toThrow(
            /--max-lifetime-payouts/,
        );
    });

    it('removes the E8 Signature cap with unlimited', () => {
        expect(
            parseTradingInputs([
                '--max-lifetime-payouts',
                'unlimited',
            ]).toSimInputs(signatureFuturesPlan()).plan.maxLifetimePayouts,
        ).toBeNull();
    });

    it('overrides the E8 Signature cap with a number', () => {
        expect(
            parseTradingInputs(['--max-lifetime-payouts', '3']).toSimInputs(
                signatureFuturesPlan(),
            ).plan.maxLifetimePayouts,
        ).toBe(3);
    });

    it('keeps the plan itself when the flag is omitted', () => {
        const plan = signatureFuturesPlan();
        expect(parseTradingInputs([]).toSimInputs(plan).plan).toBe(plan);
    });

    it('neutralizes the Apex EOD payout ladder exhaustion with unlimited', () => {
        expect(
            parseTradingInputs([
                '--max-lifetime-payouts',
                'unlimited',
            ]).toSimInputs(apexEodPlan()).plan.payoutLadder?.capsAtLastStep,
        ).toBe(true);
    });
});

describe('readGranularityList', () => {
    it('accepts the maximum granularity', () => {
        expect(readGranularityList(String(MAX_PATH_GRANULARITY))).toStrictEqual(
            [MAX_PATH_GRANULARITY],
        );
    });

    it.each([
        String(MAX_PATH_GRANULARITY + 1),
        '0',
        '-4',
        '2.5',
        'abc',
        '4,,25',
        '4,25,',
    ])('rejects %s', (raw) => {
        expect(() => readGranularityList(raw)).toThrow(/--path-granularity/);
    });

    it('trims entries', () => {
        expect(readGranularityList(' 4, 10 ,25')).toStrictEqual([4, 10, 25]);
    });

    it('returns undefined when omitted or empty', () => {
        expect(readGranularityList(undefined)).toBeUndefined();
        expect(readGranularityList('')).toBeUndefined();
    });

    it('uses the first listed value as the primary simulation granularity', () => {
        const inputs = parseTradingInputs(['--path-granularity', '10,4']);
        expect(inputs.toSimInputs(apexEodPlan()).intradayPathStepsPerR).toBe(
            10,
        );
        expect(inputs.intradayPathStepsPerR).toStrictEqual([10, 4]);
    });
});

describe('--path-granularity', () => {
    it('is left out of the shared trading flags so each command spreads its own granularity flag', () => {
        expect(tradingArguments).not.toHaveProperty('path-granularity');
    });

    const description =
        singlePathGranularityArgument['path-granularity'].description;

    it('states that the path walk applies in the eval and the funded phase', () => {
        expect(description).toMatch(/eval/);
        expect(description).toMatch(/funded/);
        expect(description).not.toContain(
            'for funded IntradayTrailingDrawdown trades',
        );
        expect(description).not.toContain('\u{2014}');
    });

    it('tells the commands that simulate one granularity that only the first value is used', () => {
        expect(description).toMatch(/only the first value/);
        expect(description).not.toMatch(/side-by-side comparison/);
    });

    it('forwards the first listed value as the single phase-agnostic granularity', () => {
        const simInputs = parseTradingInputs([
            '--path-granularity',
            '10,25',
        ]).toSimInputs(registryPlan());
        expect(simInputs.intradayPathStepsPerR).toBe(10);
    });
});

describe('TradingInputs.toCouponDiscounts (R1-2)', () => {
    it('maps the coupon flags to CouponDiscounts', () => {
        expect(
            parseTradingInputs(['--eval-discount', '30']).toCouponDiscounts(),
        ).toStrictEqual({
            activationPercent: percent(0),
            evalPercent: percent(30),
            monthlySubscriptionPercent: percent(0),
        });
    });

    it('returns undefined when no discount flag is set', () => {
        expect(parseTradingInputs([]).toCouponDiscounts()).toBeUndefined();
    });

    it('is the discounts toSimInputs forwards', () => {
        const inputs = parseTradingInputs([
            '--monthly-discount',
            '50',
            '--activation-discount',
            '10',
        ]);
        expect(inputs.toSimInputs(registryPlan()).discounts).toStrictEqual(
            inputs.toCouponDiscounts(),
        );
    });
});

describe('describeFundedContracts (WP13 handoff)', () => {
    it('describes a flat cap, a tiered cap and an unpublished cap', () => {
        expect(
            describeFundedContracts(
                { kind: ContractLimitKind.Flat, maxContracts: contracts(5) },
                'mini',
            ),
        ).toBe('5 mini');
        expect(describeFundedContracts(null, 'micro')).toBe('? micro');
    });
});

describe('formatDaysToPass (the no-pass placeholder shared by sim and compare)', () => {
    it("prints 'n/a' when no eval passed, whatever the days hold", () => {
        expect(formatDaysToPass({ evalPassProbability: 0 }, 0, 1)).toBe(
            NOT_APPLICABLE,
        );
        expect(formatDaysToPass({ evalPassProbability: 0 }, 12, 0)).toBe(
            NOT_APPLICABLE,
        );
    });

    it('prints the days with the requested decimals when an eval passed', () => {
        expect(formatDaysToPass({ evalPassProbability: 0.3 }, 7.25, 0)).toBe(
            '7',
        );
        expect(formatDaysToPass({ evalPassProbability: 0.3 }, 7.25, 1)).toBe(
            '7.3',
        );
    });

    it('treats any positive eval pass probability as a pass', () => {
        expect(hasEvalPass({ evalPassProbability: 0 })).toBe(false);
        expect(hasEvalPass({ evalPassProbability: 0.0001 })).toBe(true);
    });
});

describe("describeShare (N-43, N-45 display): the consistency cell reads the rule's boundary and net-losing cycle behavior", () => {
    function alphaPlan(variant: AlphaFuturesVariant): Plan {
        return planResolver.resolveOne({
            firm: FirmId.AlphaFutures,
            variant,
        });
    }

    it.each([AlphaFuturesVariant.Zero, AlphaFuturesVariant.Standard])(
        'shows the Alpha %s Qualified 40% rule as inclusive and failing on a net-losing cycle',
        (variant) => {
            expect(
                describeShare(alphaPlan(variant).fundedConsistencyRule()),
            ).toBe('40% (inclusive, fails on a net-losing cycle)');
        },
    );

    it('keeps an exclusive, loss-exempt rule as a bare percentage', () => {
        const rule = new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5));
        expect(describeShare(rule)).toBe('50%');
    });

    it('shows none when there is no rule', () => {
        expect(describeShare(null)).toBe('none');
        expect(describeShare(undefined)).toBe('none');
    });

    it('still accepts a bare share from callers that have not switched to the rule yet', () => {
        expect(describeShare(0.4)).toBe('40%');
    });

    it.each([
        [0.07, '7%'],
        [0.29, '29%'],
        [1 / 3, '33.33%'],
    ])(
        'rounds a bare share %s the same way the rule label does',
        (share, expected) => {
            expect(describeShare(share)).toBe(expected);
        },
    );
});
