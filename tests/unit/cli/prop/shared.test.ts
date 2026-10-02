import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import ladderCommand, {
    ladderCommandArguments,
} from '~/cli/commands/prop/ladder/command';
import optimizeDp, {
    dpArguments,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    bankrollArguments,
    copyAccountsArgument,
    describeStopRule,
    type EdgeModelArguments,
    edgeModelArguments,
    edgePlausibilityNote,
    formatDaysToPass,
    hasEvalPass,
    liveTransferHazardArgument,
    liveTransferHazardLines,
    liveTransferSweepLines,
    MAX_PATH_GRANULARITY,
    objectiveArgument,
    ObjectiveFlag,
    objectiveHeadingLine,
    ObjectiveNotApplicable,
    planArguments,
    planResolver,
    readAccountsPerSession,
    readBankroll,
    readBankrollInputs,
    readEdgeModelSpec,
    readFraction,
    readGranularityList,
    readHoursPerDay,
    readInteger,
    readLadder,
    readLiveTransferHazard,
    readLossThreshold,
    readMaxLifetimePayouts,
    readNonNegativeInteger,
    readNonNegativeNumber,
    readNumberList,
    readObjective,
    readPercent,
    readPercentAsFraction,
    readPositiveInteger,
    readPositiveNumber,
    readRebuyLagDays,
    readScreenTime,
    readStopRule,
    RuinFirstNeedsBankroll,
    screenTimeArguments,
    singlePathGranularityArgument,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
    verifiedTriggerLines,
} from '~/cli/commands/prop/shared';
import * as sharedModule from '~/cli/commands/prop/shared';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    AlphaFuturesVariant,
    APEX_LIVE_DAILY_LOSS_LIMIT,
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    CumulativeAmountTrigger,
    DailyLossLimitKind,
    type DayStopRule,
    DayStopRuleKind,
    dollars,
    E8FuturesVariant,
    EdgeModelKind,
    findFirm,
    FirmId,
    fraction,
    LiveTransferContinuationKind,
    percent,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    SizingObjective,
    sizingObjectiveText,
} from '~/lib/prop-calculator/advisor';
import {
    DEFAULT_RULEBOOK,
    rulebookSchema,
} from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import { SIZING_OBJECTIVE_LABEL } from '~/lib/prop-calculator/advisor/policy';
import { solveAverageRewardPolicy } from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    ContractUnit,
    describeDll,
    describeFundedContracts,
    describeShare,
} from '~/lib/prop-calculator/describe';

vi.mock(
    import('~/lib/prop-calculator/core/AverageRewardSolver'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            solveAverageRewardPolicy: vi.fn(actual.solveAverageRewardPolicy),
        };
    },
);

const ARGS = {
    ...planArguments,
    ...tradingArguments,
    ...singlePathGranularityArgument,
} satisfies ArgsDef;

function registryPlan() {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant: 'rapid-eod' });
}

function stubTriggers(
    triggers: readonly CumulativeAmountTrigger[],
): Plan {
    const plan = registryPlan();
    const firm = findFirm(plan.id.firm);
    if (!firm) throw new Error('firm not registered');
    vi.spyOn(firm.accountPolicy, 'liveTriggersFor').mockReturnValue(
        triggers,
    );
    return plan;
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
                ContractUnit.Mini,
            ),
        ).toBe('5 mini');
        expect(describeFundedContracts(null, ContractUnit.Micro)).toBe(
            '? micro',
        );
    });

    it('takes the unit as a ContractUnit enum member (WP21b)', () => {
        expect(Object.values(ContractUnit)).toStrictEqual(['micro', 'mini']);
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
});

describe('describeDll prints a no-limit tier (WP22b)', () => {
    it('shows the Apex Live Level 1 no-limit tier next to its $5000-$10000 range', () => {
        expect(describeDll(APEX_LIVE_DAILY_LOSS_LIMIT, false)).toBe(
            '$5000-$10000, none on some tiers',
        );
    });

    it('shows a single limited tier beside an unlimited one', () => {
        expect(
            describeDll(
                {
                    kind: DailyLossLimitKind.Tiered,
                    tiers: [
                        {
                            dailyLossLimit: null,
                            maxContracts: contracts(5),
                            minProfit: 0,
                        },
                        {
                            dailyLossLimit: dollars(2000),
                            maxContracts: contracts(10),
                            minProfit: 5000,
                        },
                    ],
                },
                true,
            ),
        ).toBe('$2000, none on some tiers (hard)');
    });
});

describe('bankroll and screen-time flags (PT-54, F-V13, F-V25)', () => {
    it('declares --bankroll and --loss-threshold as optional strings with no default, so absent means not set', () => {
        for (const flag of Object.values(bankrollArguments)) {
            expect(flag.type).toBe('string');
            expect(flag).not.toHaveProperty('default');
        }
        expect(
            Object.keys(bankrollArguments).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toStrictEqual(['bankroll', 'loss-threshold']);
    });

    it('declares --hours-per-day and --accounts-per-session as optional strings with no default', () => {
        for (const flag of Object.values(screenTimeArguments)) {
            expect(flag.type).toBe('string');
            expect(flag).not.toHaveProperty('default');
        }
        expect(
            Object.keys(screenTimeArguments).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toStrictEqual(['accounts-per-session', 'hours-per-day']);
    });

    it('says what each flag drives and that an absent threshold is not set', () => {
        expect(bankrollArguments.bankroll.description).toContain(
            'attempts affordable',
        );
        expect(bankrollArguments.bankroll.description).toContain(
            'P(batch net < 0)',
        );
        expect(bankrollArguments['loss-threshold'].description).toContain(
            'not set',
        );
        expect(screenTimeArguments['hours-per-day'].description).toContain(
            '$/screen hour',
        );
        expect(
            screenTimeArguments['accounts-per-session'].description,
        ).toContain('copy group counts as one account');
        for (const flag of [
            ...Object.values(bankrollArguments),
            ...Object.values(screenTimeArguments),
        ]) {
            expect(flag.description).not.toContain('\u{2014}');
        }
    });

    it('reads --bankroll as dollars, null when absent or empty', () => {
        expect(readBankroll(undefined)).toBeNull();
        expect(readBankroll('')).toBeNull();
        expect(readBankroll('5000')).toBe(5000);
        expect(readBankroll('2500.5')).toBe(2500.5);
    });

    it.each(['0', '-100', 'abc', 'Infinity'])(
        'rejects --bankroll %s with a typed error naming the flag',
        (raw) => {
            expect(() => readBankroll(raw)).toThrow(TypeError);
            expect(() => readBankroll(raw)).toThrow(
                /--bankroll must be a dollar amount > 0/,
            );
        },
    );

    it('reads --loss-threshold as a fraction inside the rulebook bounds, null when absent', () => {
        expect(readLossThreshold(undefined)).toBeNull();
        expect(readLossThreshold('')).toBeNull();
        expect(readLossThreshold('0.05')).toBe(0.05);
        expect(readLossThreshold('0.5')).toBe(0.5);
    });

    it.each(['0', '0.51', '1', '-0.1', 'five'])(
        'rejects --loss-threshold %s with the rulebook bound in the message',
        (raw) => {
            expect(() => readLossThreshold(raw)).toThrow(TypeError);
            expect(() => readLossThreshold(raw)).toThrow(
                /--loss-threshold must be a fraction above 0 and at most 0\.5/,
            );
        },
    );

    it('reads the bankroll inputs together', () => {
        expect(readBankrollInputs({})).toStrictEqual({
            bankroll: null,
            lossThreshold: null,
        });
        expect(
            readBankrollInputs({ bankroll: '5000', 'loss-threshold': '0.05' }),
        ).toStrictEqual({ bankroll: 5000, lossThreshold: 0.05 });
    });

    it('reads --hours-per-day inside the rulebook bounds (above 0, at most 16)', () => {
        expect(readHoursPerDay(undefined)).toBeNull();
        expect(readHoursPerDay('2')).toBe(2);
        expect(readHoursPerDay('16')).toBe(16);
        for (const raw of ['0', '16.5', '-1', 'x']) {
            expect(() => readHoursPerDay(raw)).toThrow(
                /--hours-per-day must be a number of hours above 0 and at most 16/,
            );
        }
    });

    it('reads --accounts-per-session as a whole number inside the rulebook bounds (1 to 200)', () => {
        expect(readAccountsPerSession(undefined)).toBeNull();
        expect(readAccountsPerSession('3')).toBe(3);
        expect(readAccountsPerSession('200')).toBe(200);
        for (const raw of ['0', '1.5', '201', 'x']) {
            expect(() => readAccountsPerSession(raw)).toThrow(
                /--accounts-per-session must be a whole number from 1 to 200/,
            );
        }
    });

    it('bounds match the rulebook schema, so the CLI and the rulebook page accept the same values', () => {
        const bankroll = rulebookBankrollShape();
        expect(bankroll.lossRiskThreshold.safeParse(0.5).success).toBe(true);
        expect(bankroll.lossRiskThreshold.safeParse(0.51).success).toBe(false);
        expect(bankroll.sessionHoursPerDay.safeParse(16).success).toBe(true);
        expect(bankroll.sessionHoursPerDay.safeParse(16.5).success).toBe(false);
        expect(bankroll.accountsPerSession.safeParse(200).success).toBe(true);
        expect(bankroll.accountsPerSession.safeParse(201).success).toBe(false);
    });

    it('reads the screen time only as a pair, null when both are absent', () => {
        expect(readScreenTime({})).toBeNull();
        expect(
            readScreenTime({
                'accounts-per-session': '3',
                'hours-per-day': '2',
            }),
        ).toStrictEqual({ accountsPerSession: 3, sessionHoursPerDay: 2 });
    });

    it.each([[{ 'hours-per-day': '2' }], [{ 'accounts-per-session': '3' }]])(
        'fails loud when only one of the pair is given (%o)',
        (arguments_) => {
            expect(() => readScreenTime(arguments_)).toThrow(TypeError);
            expect(() => readScreenTime(arguments_)).toThrow(
                /--hours-per-day and --accounts-per-session go together/,
            );
        },
    );
});

function rulebookBankrollShape() {
    const { accountsPerSession, lossRiskThreshold, sessionHoursPerDay } =
        rulebookSchema.shape.bankroll.shape;
    return {
        accountsPerSession: accountsPerSession.unwrap(),
        lossRiskThreshold: lossRiskThreshold.unwrap(),
        sessionHoursPerDay: sessionHoursPerDay.unwrap(),
    };
}

describe('--copy-accounts help (PT-54, F-V10)', () => {
    it('says copied accounts are one correlated outcome that counts once as pass-rate evidence', () => {
        const help = copyAccountsArgument['copy-accounts'].description;
        expect(help).toContain('multiplies per-account fees and P&L');
        expect(help).toContain('one correlated outcome');
        expect(help).toContain('count once as pass-rate evidence');
        expect(help).not.toContain('\u{2014}');
    });
});

describe('edgePlausibilityNote (PT-54, F-V22)', () => {
    it('is silent at a typical edge: 40% at 1:2 and 52% at 1:1', () => {
        expect(
            edgePlausibilityNote({ rrRatio: 2, winrate: fraction(0.4) }),
        ).toBeNull();
        expect(
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.52) }),
        ).toBeNull();
    });

    it('flags 70% at 1:1 as implausible with its expectancy and the thresholds', () => {
        const note = edgePlausibilityNote({
            rrRatio: 1,
            winrate: fraction(0.7),
        });
        expect(note).toContain('Implausible edge');
        expect(note).toContain('+0.40R per trade at 70% and 1:1.00');
        expect(note).toContain('typical up to +0.30R, strong up to +0.35R');
    });

    it('flags 50% at 1:1.64 (+0.32R) as strong', () => {
        expect(
            edgePlausibilityNote({ rrRatio: 1.64, winrate: fraction(0.5) }),
        ).toContain('Strong edge');
    });

    it('flags a negative expectancy as no edge', () => {
        const note = edgePlausibilityNote({
            rrRatio: 2,
            winrate: fraction(0.3),
        });
        expect(note).toContain('No edge');
        expect(note).toContain('-0.10R per trade at 30% and 1:2.00');
    });

    it('names both expectancy sources while the authoritative one is open (QV-20)', () => {
        const note = edgePlausibilityNote({
            rrRatio: 1,
            winrate: fraction(0.7),
        });
        expect(note).toContain('+0.20R from 40% at 1:2');
        expect(note).toContain('+0.26R');
        expect(note).not.toContain('\u{2014}');
    });

    it('reads the thresholds passed in, defaulting to the rulebook defaults', () => {
        expect(
            edgePlausibilityNote(
                { rrRatio: 2, winrate: fraction(0.4) },
                { strongMaxExpectancyR: 0.25, typicalMaxExpectancyR: 0.15 },
            ),
        ).toContain('Strong edge');
        expect(DEFAULT_RULEBOOK.plausibility).toStrictEqual({
            strongMaxExpectancyR: 0.35,
            typicalMaxExpectancyR: 0.3,
        });
    });

    it('checks the funded reward:risk too when it differs from the eval one', () => {
        const notes = tradingEdgeNotes({
            fundedRrRatio: 3,
            rrRatio: 2,
            winrate: fraction(0.4),
        });
        expect(notes).toStrictEqual([
            edgePlausibilityNote({ rrRatio: 3, winrate: fraction(0.4) }),
        ]);
        expect(
            tradingEdgeNotes({
                fundedRrRatio: undefined,
                rrRatio: 1,
                winrate: fraction(0.7),
            }),
        ).toStrictEqual([
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }),
        ]);
        expect(
            tradingEdgeNotes({
                fundedRrRatio: 2,
                rrRatio: 2,
                winrate: fraction(0.4),
            }),
        ).toStrictEqual([]);
    });
});

async function capturedStdout(run: () => Promise<unknown>): Promise<string> {
    const written: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
    const exitCode = process.exitCode;
    try {
        await run();
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return written.join('');
}

describe('the plausibility note on prop ladder and optimize dp (PT-54 step 4, one helper, one text)', () => {
    const implausibleNote =
        edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }) ?? '';

    it('prop ladder prints the note for 70% at 1:1', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--winrate',
            '0.7',
            '--rr',
            '1',
            '--lo',
            '500',
            '--max',
            '500',
            '--rungs',
            '1',
            '--trials',
            '5',
            '--top',
            '1',
        ];
        const stdout = await capturedStdout(async () => {
            await ladderCommand.run?.({
                args: parseArgs<typeof ladderCommandArguments>(
                    argv,
                    ladderCommandArguments,
                ),
                cmd: ladderCommand,
                rawArgs: argv,
            });
        });
        expect(implausibleNote).not.toBe('');
        expect(stdout).toContain(implausibleNote);
    });

    it('prop ladder stays silent at 40% at 1:2', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--lo',
            '500',
            '--max',
            '500',
            '--rungs',
            '1',
            '--trials',
            '5',
            '--top',
            '1',
        ];
        const stdout = await capturedStdout(async () => {
            await ladderCommand.run?.({
                args: parseArgs<typeof ladderCommandArguments>(
                    argv,
                    ladderCommandArguments,
                ),
                cmd: ladderCommand,
                rawArgs: argv,
            });
        });
        expect(stdout).not.toMatch(
            /\b(?:implausible|no|strong|typical) edge\b/,
        );
    });

    it('optimize dp prints the note before the solve for 70% at 1:1', async () => {
        const argv = [
            '--firm',
            'alphafutures',
            '--variant',
            'zero',
            '--winrate',
            '0.7',
            '--rr',
            '1',
        ];
        vi.mocked(solveAverageRewardPolicy).mockImplementationOnce(() => {
            throw new Error('stop after the preamble');
        });
        const stdout = await capturedStdout(async () => {
            await optimizeDp.run?.({
                args: parseArgs<typeof dpArguments>(argv, dpArguments),
                cmd: optimizeDp,
                rawArgs: argv,
            });
        });
        expect(implausibleNote).not.toBe('');
        expect(stdout).toContain(implausibleNote);
    });
});

describe('edgeModelArguments (PT-64a, F-V23)', () => {
    it('defaults --edge-model to fixed', () => {
        const parsed = parseArgs([], edgeModelArguments);
        expect(parsed['edge-model']).toBe(EdgeModelKind.Fixed);
    });

    it('only accepts fixed and drift for --edge-model', () => {
        const argument = edgeModelArguments['edge-model'];
        expect(argument.options).toStrictEqual(Object.values(EdgeModelKind));
        expect(() =>
            parseArgs(['--edge-model', 'random-walk'], edgeModelArguments),
        ).toThrow();
    });

    it('leaves --edge-anchor-rr undefined when not given', () => {
        const parsed = parseArgs([], edgeModelArguments);
        expect(parsed['edge-anchor-rr']).toBeUndefined();
    });
});

describe('readEdgeModelSpec (PT-64a, F-V23)', () => {
    const inputs = { rrRatio: 2, winrate: fraction(0.4) };

    it('builds a fixed spec at the stated winrate, ignoring --edge-anchor-rr', () => {
        const arguments_: EdgeModelArguments = {
            'edge-anchor-rr': '3',
            'edge-model': EdgeModelKind.Fixed,
        };
        expect(readEdgeModelSpec(arguments_, inputs)).toStrictEqual({
            kind: EdgeModelKind.Fixed,
            winrate: fraction(0.4),
        });
    });

    it('builds a drift spec anchored at --rr when --edge-anchor-rr is omitted', () => {
        const arguments_: EdgeModelArguments = {
            'edge-model': EdgeModelKind.Drift,
        };
        expect(readEdgeModelSpec(arguments_, inputs)).toStrictEqual({
            anchorRrRatio: 2,
            anchorWinrate: fraction(0.4),
            kind: EdgeModelKind.Drift,
        });
    });

    it('builds a drift spec anchored at --edge-anchor-rr when given', () => {
        const arguments_: EdgeModelArguments = {
            'edge-anchor-rr': '3',
            'edge-model': EdgeModelKind.Drift,
        };
        expect(readEdgeModelSpec(arguments_, inputs)).toStrictEqual({
            anchorRrRatio: 3,
            anchorWinrate: fraction(0.4),
            kind: EdgeModelKind.Drift,
        });
    });

    it('rejects a non-numeric --edge-anchor-rr', () => {
        const arguments_: EdgeModelArguments = {
            'edge-anchor-rr': 'nope',
            'edge-model': EdgeModelKind.Drift,
        };
        expect(() => readEdgeModelSpec(arguments_, inputs)).toThrow();
    });
});

function ruinFirstOn(surface: RankingSurface): SizingObjective {
    return readObjective(
        { bankroll: '5000', objective: 'ruin-first' },
        surface,
    );
}

function ruinFirstWithoutBankroll(): SizingObjective {
    return readObjective({ objective: 'ruin-first' }, RankingSurface.Compare);
}

describe('readObjective (PT-63, F-V15)', () => {
    it('defaults to MonthlyNet when --objective is absent (Q1)', () => {
        expect(readObjective({}, RankingSurface.Compare)).toBe(
            SizingObjective.MonthlyNet,
        );
    });

    it('maps monthly and cycle onto MonthlyNet and CycleCash on every surface', () => {
        for (const surface of Object.values(RankingSurface)) {
            expect(readObjective({ objective: 'monthly' }, surface)).toBe(
                SizingObjective.MonthlyNet,
            );
            expect(readObjective({ objective: 'cycle' }, surface)).toBe(
                SizingObjective.CycleCash,
            );
        }
    });

    it('names the three flag values after the SizingObjective members', () => {
        expect(Object.values(ObjectiveFlag)).toStrictEqual([
            'cycle',
            'monthly',
            'ruin-first',
        ]);
        const argument = objectiveArgument.objective;
        expect(argument.type).toBe('enum');
        expect(argument.options).toStrictEqual(Object.values(ObjectiveFlag));
    });

    it('accepts ruin-first with a bankroll where it ranks which plan to buy', () => {
        expect(
            readObjective(
                { bankroll: '5000', objective: 'ruin-first' },
                RankingSurface.Compare,
            ),
        ).toBe(SizingObjective.RuinFirst);
    });

    it('needs --bankroll for ruin-first, as a typed error', () => {
        expect(ruinFirstWithoutBankroll).toThrow(RuinFirstNeedsBankroll);
        expect(ruinFirstWithoutBankroll).toThrow(/--bankroll/);
        expect(() =>
            readObjective(
                { bankroll: '', objective: 'ruin-first' },
                RankingSurface.Compare,
            ),
        ).toThrow(RuinFirstNeedsBankroll);
    });

    it('rejects a bad --bankroll for ruin-first instead of ignoring it', () => {
        expect(() =>
            readObjective(
                { bankroll: 'lots', objective: 'ruin-first' },
                RankingSurface.Compare,
            ),
        ).toThrow(/bankroll/);
    });

    it('refuses ruin-first with ObjectiveNotApplicable where it would size eval rungs or funded risk', () => {
        for (const surface of [
            RankingSurface.Dp,
            RankingSurface.FundedRiskSweep,
            RankingSurface.Ladder,
        ]) {
            expect(() => ruinFirstOn(surface)).toThrow(ObjectiveNotApplicable);
            expect(() => ruinFirstOn(surface)).toThrow(
                'RuinFirst only ranks which plan to buy; eval rungs and funded risk stay on Hard Rules 3 and 5',
            );
        }
    });

    it('reports not applicable before it asks for a bankroll', () => {
        expect(() =>
            readObjective({ objective: 'ruin-first' }, RankingSurface.Ladder),
        ).toThrow(ObjectiveNotApplicable);
    });

    it('rejects an unknown objective naming the choices', () => {
        expect(() =>
            readObjective({ objective: 'fast' }, RankingSurface.Compare),
        ).toThrow(/monthly/);
    });
});

describe('objectiveHeadingLine (PT-63, VD-6)', () => {
    it('names the active objective with its ranking sentence and no em dash', () => {
        for (const objective of Object.values(SizingObjective)) {
            const line = objectiveHeadingLine(objective);
            expect(line).toContain(SIZING_OBJECTIVE_LABEL[objective]);
            expect(line).toContain(sizingObjectiveText(objective));
            expect(line).not.toContain('\u{2014}');
        }
    });
});

describe('--live-transfer-hazard (PT-73, VD-17)', () => {
    const HAZARD_ARGS = {
        ...ARGS,
        ...liveTransferHazardArgument,
    } satisfies ArgsDef;

    function parseWithHazard(argv: string[]): TradingInputs {
        return TradingInputs.parse(
            parseArgs<typeof HAZARD_ARGS>(argv, HAZARD_ARGS),
        );
    }

    it('is absent by default and changes nothing in the simulation inputs', () => {
        const inputs = parseWithHazard([]);
        expect(inputs.liveTransferHazard).toBeUndefined();
        expect(
            inputs.toSimInputs(registryPlan()).liveTransferHazard,
        ).toBeUndefined();
    });

    it('threads a parsed probability through TradingInputs into SimInputs', () => {
        const inputs = parseWithHazard(['--live-transfer-hazard', '0.2']);
        expect(inputs.liveTransferHazard).toBe(0.2);
        expect(inputs.toSimInputs(registryPlan()).liveTransferHazard).toBe(0.2);
    });

    it('names itself as your assumption, not a firm rule, in its help text', () => {
        expect(
            liveTransferHazardArgument['live-transfer-hazard'].description,
        ).toContain('your assumption, not a firm rule');
    });

    it.each(['-0.1', '1.5', 'abc'])('rejects %s, naming the flag', (raw) => {
        expect(() => readLiveTransferHazard(raw)).toThrow(
            /--live-transfer-hazard/,
        );
    });

    it('reads an empty value as absent', () => {
        expect(readLiveTransferHazard(undefined)).toBeUndefined();
        expect(readLiveTransferHazard('')).toBeUndefined();
    });

    describe('liveTransferHazardLines', () => {
        const modeled = {
            liveTransferContinuation: LiveTransferContinuationKind.Modeled,
            liveTransferProbability: 0.413,
        };
        const notModeled = {
            liveTransferContinuation: LiveTransferContinuationKind.NotModeled,
            liveTransferProbability: 0.413,
        };

        it('prints nothing without a hazard', () => {
            expect(liveTransferHazardLines(undefined, modeled)).toStrictEqual(
                [],
            );
            expect(liveTransferHazardLines(0, modeled)).toStrictEqual([]);
        });

        it('labels the rate as your assumption and gives the share sent live', () => {
            const [line] = liveTransferHazardLines(0.2, modeled);
            expect(line).toContain('your assumption, not a firm rule');
            expect(line).toContain('20.0% per paid payout');
            expect(line).toContain('41.3%');
        });

        it('says the live plan continues the account where one is modeled', () => {
            const text = liveTransferHazardLines(0.2, modeled).join('\n');
            expect(text).toContain('modeled live plan');
            expect(text).not.toContain('valued at $0');
        });

        it('says the rest is valued at $0 where no live plan is modeled', () => {
            const text = liveTransferHazardLines(0.2, notModeled).join('\n');
            expect(text).toContain('valued at $0');
        });

        it('never uses an em dash', () => {
            const text = liveTransferHazardLines(0.2, notModeled).join('\n');
            expect(text).not.toContain('\u{2014}');
        });

        it('says the live model is an approximation when part of it is assumed', () => {
            const text = liveTransferHazardLines(0.2, {
                liveTransferContinuation:
                    LiveTransferContinuationKind.ModeledApproximate,
                liveTransferProbability: 0.413,
            }).join('\n');
            expect(text).toContain('modeled live plan');
            expect(text).toContain('approximation');
            expect(text).not.toContain('valued at $0');
        });

        it('prints the continuation line for a trigger-only run with no hazard', () => {
            const lines = liveTransferHazardLines(undefined, notModeled, true);
            expect(lines).toHaveLength(1);
            expect(lines.join('\n')).toContain('valued at $0');
            expect(lines.join('\n')).not.toContain('your assumption');
            expect(
                liveTransferHazardLines(0, modeled, true).join('\n'),
            ).toContain('modeled live plan');
        });

        it('prints the continuation line of a sweep for a trigger-only run too', () => {
            const lines = liveTransferSweepLines(
                undefined,
                LiveTransferContinuationKind.NotModeled,
                true,
            );
            expect(lines.join('\n')).toContain('valued at $0');
            expect(
                liveTransferSweepLines(
                    undefined,
                    LiveTransferContinuationKind.NotModeled,
                ),
            ).toStrictEqual([]);
        });
    });
});

describe('verified cumulative payout triggers reach the simulation inputs (PT-73)', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('leaves the field unset for every firm whose triggers are not checked', () => {
        expect(
            parseTradingInputs([]).toSimInputs(registryPlan())
                .verifiedCumulativePayoutTrigger,
        ).toBeUndefined();
    });

    it('carries a confirmed cumulative amount into the simulation inputs', () => {
        const plan = stubTriggers([
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ]);
        expect(
            parseTradingInputs([]).toSimInputs(plan)
                .verifiedCumulativePayoutTrigger,
        ).toBe(20_000);
    });

    it('does not carry a cumulative amount the firm pages disagree on', () => {
        const plan = stubTriggers([
            new CumulativeAmountTrigger(dollars(20_000), {
                ...confirmed,
                conflicting: { ...confirmed, quote: 'other' },
                verification: PolicyVerification.Conflict,
            }),
        ]);
        expect(
            parseTradingInputs([]).toSimInputs(plan)
                .verifiedCumulativePayoutTrigger,
        ).toBeUndefined();
    });

    it('prints nothing without a verified trigger and names the threshold with one', () => {
        expect(verifiedTriggerLines(undefined)).toStrictEqual([]);
        const [line] = verifiedTriggerLines(20_000);
        expect(line).toContain('$20,000');
        expect(line).toContain('verified firm trigger');
        expect(line).not.toContain('\u{2014}');
    });

    it('states that the amount is compared per account on what the trader receives', () => {
        const [line] = verifiedTriggerLines(20_000);
        expect(line).toContain('per account');
        expect(line).toContain('trader receives');
    });
});
