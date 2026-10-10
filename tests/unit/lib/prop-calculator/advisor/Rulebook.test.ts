import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import {
    DayStopRuleKind,
    FirmId,
    fraction,
    MAX_LADDER_SLOTS,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    EvalMaxRiskRule,
    EvalSizingMode,
    type FundedStopRule,
    fundedStopRuleToDayStopRule,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    RiskDisplayUnit,
    RULEBOOK_SCHEMA_VERSION,
    rulebookDeviation,
    type RulebookParameters,
    rulebookSchema,
    withRulebookDefaults,
} from '~/lib/prop-calculator/advisor';
import {
    edgePlausibility,
    PlausibilityLevel,
    type PlausibilityThresholds,
} from '~/lib/prop-calculator/economics';

const PROP_CALCULATOR_SOURCE = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
);

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function defaultPlausibilityAt(
    winrate: number,
    rrRatio: number,
): PlausibilityLevel | undefined {
    return edgePlausibility({
        rrRatio,
        thresholds: DEFAULT_RULEBOOK.plausibility,
        winrate: fraction(winrate),
    }).value?.level;
}

function filesDefining(pattern: RegExp): string[] {
    return readdirSync(PROP_CALCULATOR_SOURCE, { recursive: true })
        .map(String)
        .filter((name) => name.endsWith('.ts'))
        .filter((name) =>
            pattern.test(
                readFileSync(path.join(PROP_CALCULATOR_SOURCE, name), 'utf8'),
            ),
        )
        .map((name) => name.split(path.sep).join('/'));
}

function isValid(candidate: unknown): boolean {
    return rulebookSchema.safeParse(candidate).success;
}

function storedV1(): Record<string, unknown> {
    const draft = structuredClone(DEFAULT_RULEBOOK);
    return {
        ...without(draft, [
            'bankroll',
            'display',
            'liveTransfer',
            'plausibility',
            'samples',
        ]),
        alerts: without(draft.alerts, [
            'dayLossBankrollFraction',
            'firmProfitConcentrationCount',
            'firmProfitConcentrationShare',
            'payoutReadyLossFraction',
            'payoutReadyRiskAboveRungCents',
        ]),
        review: without(draft.review, [
            'monthlyPayoutTargetCents',
            'targetMonthlyMultiple',
        ]),
    };
}

function without(
    record: object,
    keys: readonly string[],
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(record).filter(([key]) => !keys.includes(key)),
    );
}

function withSection(
    section: keyof RulebookParameters,
    patch: Record<string, unknown>,
): unknown {
    const draft = structuredClone(DEFAULT_RULEBOOK);
    return { ...draft, [section]: { ...(draft[section] as object), ...patch } };
}

describe('DEFAULT_RULEBOOK', () => {
    it('uses his numbers: winrate 0.4, rr 2, up to 4 trades a day', () => {
        expect(DEFAULT_RULEBOOK.strategy).toEqual({
            rr: 2,
            tradesPerDayMax: 4,
            winrate: 0.4,
        });
    });

    it('defaults the eval to the general-derivation ladder', () => {
        expect(DEFAULT_RULEBOOK.eval.mode).toBe(EvalSizingMode.Ladder);
        expect(DEFAULT_RULEBOOK.eval.ladderFractionSource).toBe(
            LadderFractionSource.GeneralDerivation,
        );
        expect(DEFAULT_RULEBOOK.eval.generalDerivation).toEqual({
            escalation: 1.5,
            firstRungFraction: 0.2,
        });
    });

    it('stores the MFF Rapid EOD search fractions for the opt-in source', () => {
        expect(DEFAULT_RULEBOOK.eval.mffSearchFractions).toEqual([
            0.2, 0.3, 0.4, 0.1,
        ]);
    });

    it('keeps max-risk available with a daily cap of 2 x risk', () => {
        expect(DEFAULT_RULEBOOK.eval.maxRiskDailyCapMultiple).toBe(2);
        expect(
            isValid(withSection('eval', { mode: EvalSizingMode.MaxRisk })),
        ).toBe(true);
    });

    it('rounds eval rungs to $50', () => {
        expect(DEFAULT_RULEBOOK.eval.roundingStepCents).toBe(5000);
    });

    it('has no eval risk field', () => {
        expect(
            Object.keys(DEFAULT_RULEBOOK.eval).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual([
            'generalDerivation',
            'ladderFractionSource',
            'maxRiskDailyCapMultiple',
            'mffSearchFractions',
            'mode',
            'roundingStepCents',
        ]);
    });

    it('sizes funded at a flat $250 risk and $500 target with his trade count and no extra stop rule', () => {
        expect(DEFAULT_RULEBOOK.funded).toEqual({
            riskCents: 25_000,
            stopRule: { kind: DayStopRuleKind.None },
            takeProfitCents: 50_000,
            tradesPerDayMax: 4,
        });
    });

    it('sizes live at 5% of cushion before the lock and 10% after', () => {
        expect(DEFAULT_RULEBOOK.live.cushionPercent).toEqual({
            postLock: 0.1,
            preLock: 0.05,
        });
    });

    it('keeps a $2,000 retained cushion and requests $500 payouts', () => {
        expect(DEFAULT_RULEBOOK.payout).toEqual({
            allowBelowHardRule2: false,
            requestCents: 50_000,
            retainedCushionCents: 200_000,
        });
        expect(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS).toBe(200_000);
    });

    it('allows one trade per trading window', () => {
        expect(DEFAULT_RULEBOOK.execution).toEqual({ maxTradesPerWindow: 1 });
    });

    it('reviews on Monday and flags funded snapshots older than 7 days, with no payout targets set', () => {
        expect(DEFAULT_RULEBOOK.review).toEqual({
            fundedStaleDays: 7,
            monthlyPayoutTargetCents: null,
            targetMonthlyMultiple: null,
            weekday: ReviewWeekday.Monday,
        });
    });

    it('carries the U16 alert thresholds and leaves every newer alert off', () => {
        expect(DEFAULT_RULEBOOK.alerts).toEqual({
            dayLossBankrollFraction: null,
            evalDaysRemainingWarning: 5,
            evalNearFloorDrawdownFraction: 0.25,
            firmProfitConcentrationCount: null,
            firmProfitConcentrationShare: null,
            fundedNearFloorRiskMultiple: 2,
            payoutReadyLossFraction: null,
            payoutReadyRiskAboveRungCents: null,
        });
    });

    it('leaves every bankroll threshold unset and groups rounds by 14-day purchase gaps', () => {
        expect(DEFAULT_RULEBOOK.bankroll).toEqual({
            accountsPerSession: null,
            dailyAccountCapacity: null,
            defaultRoundBudgetCents: null,
            lossRiskThreshold: null,
            objectiveSwitchCents: null,
            roundGapDays: 14,
            sessionHoursPerDay: null,
        });
    });

    it('leaves every sample minimum unset', () => {
        expect(DEFAULT_RULEBOOK.samples).toEqual({
            minClosedRounds: null,
            minEndedAccounts: null,
            minEvalAttempts: null,
            minFundedAccounts: null,
            minTrades: null,
        });
    });

    it('leaves the ended-accounts threshold null so it falls back to the funded-accounts one', () => {
        expect(DEFAULT_RULEBOOK.samples.minEndedAccounts).toBeNull();
    });

    it('calls expectancy typical up to 0.30R and strong up to 0.35R, outside the strategy section', () => {
        expect(DEFAULT_RULEBOOK.plausibility).toEqual({
            strongMaxExpectancyR: 0.35,
            typicalMaxExpectancyR: 0.3,
        });
        expect(Object.keys(DEFAULT_RULEBOOK.strategy)).not.toContain(
            'typicalMaxExpectancyR',
        );
    });

    it('shows risk in account dollars', () => {
        expect(DEFAULT_RULEBOOK.display.riskUnit).toBe(
            RiskDisplayUnit.AccountDollars,
        );
        expect(Object.values(RiskDisplayUnit).toSorted(byName)).toEqual(
            ['account-dollars', 'ev-at-stake', 'fee-equivalent'].toSorted(
                byName,
            ),
        );
    });

    it('prices no live-transfer hazard for any firm', () => {
        expect(DEFAULT_RULEBOOK.liveTransfer).toEqual({
            hazardPerPaidPayoutByFirm: {},
        });
    });

    it('is schema version 1', () => {
        expect(DEFAULT_RULEBOOK.schemaVersion).toBe(1);
        expect(RULEBOOK_SCHEMA_VERSION).toBe(1);
    });

    it('passes its own schema unchanged', () => {
        const parsed = rulebookSchema.parse(structuredClone(DEFAULT_RULEBOOK));
        expect(parsed).toEqual(DEFAULT_RULEBOOK);
    });

    it('survives a JSON round trip', () => {
        const stored = JSON.stringify(DEFAULT_RULEBOOK);
        const parsed: RulebookParameters = rulebookSchema.parse(
            JSON.parse(stored),
        );
        expect(parsed).toEqual(DEFAULT_RULEBOOK);
    });
});

describe('rulebookSchema', () => {
    it('rejects MFF-style fractions that do not sum to 1', () => {
        expect(
            isValid(
                withSection('eval', {
                    mffSearchFractions: [0.2, 0.3, 0.4, 0.2],
                }),
            ),
        ).toBe(false);
        expect(
            isValid(
                withSection('eval', { mffSearchFractions: [0.5, 0.5 - 1e-6] }),
            ),
        ).toBe(false);
    });

    it('accepts fractions that sum to 1 within 1e-9', () => {
        expect(
            isValid(
                withSection('eval', {
                    mffSearchFractions: [0.1, 0.2, 0.3, 0.4],
                }),
            ),
        ).toBe(true);
        expect(
            isValid(
                withSection('eval', {
                    mffSearchFractions: [1 / 3, 1 / 3, 1 / 3],
                }),
            ),
        ).toBe(true);
    });

    it('rejects a fraction at or below zero', () => {
        expect(
            isValid(withSection('eval', { mffSearchFractions: [0.5, 0.5, 0] })),
        ).toBe(false);
        expect(
            isValid(
                withSection('eval', { mffSearchFractions: [0.6, 0.6, -0.2] }),
            ),
        ).toBe(false);
    });

    it('rejects more rungs than MAX_LADDER_SLOTS and an empty ladder', () => {
        const tooMany = Array.from(
            { length: MAX_LADDER_SLOTS + 1 },
            () => 1 / (MAX_LADDER_SLOTS + 1),
        );
        expect(
            isValid(withSection('eval', { mffSearchFractions: tooMany })),
        ).toBe(false);
        const maxAllowed = Array.from(
            { length: MAX_LADDER_SLOTS },
            () => 1 / MAX_LADDER_SLOTS,
        );
        expect(
            isValid(withSection('eval', { mffSearchFractions: maxAllowed })),
        ).toBe(true);
        expect(isValid(withSection('eval', { mffSearchFractions: [] }))).toBe(
            false,
        );
    });

    it('rejects a general-derivation first fraction outside (0, 1)', () => {
        for (const value of [0, 1, -0.1, 1.2]) {
            expect(
                isValid(
                    withSection('eval', {
                        generalDerivation: {
                            escalation: 1.5,
                            firstRungFraction: value,
                        },
                    }),
                ),
            ).toBe(false);
        }
    });

    it('rejects an escalation at or below zero', () => {
        for (const value of [0, -1]) {
            expect(
                isValid(
                    withSection('eval', {
                        generalDerivation: {
                            escalation: value,
                            firstRungFraction: 0.2,
                        },
                    }),
                ),
            ).toBe(false);
        }
    });

    it('rejects a winrate outside (0, 1)', () => {
        for (const value of [0, 1, -0.4, 1.4]) {
            expect(isValid(withSection('strategy', { winrate: value }))).toBe(
                false,
            );
        }
    });

    it('rejects rr at or below zero', () => {
        for (const value of [0, -2]) {
            expect(isValid(withSection('strategy', { rr: value }))).toBe(false);
        }
    });

    it('rejects a retained cushion below $2,000 unless allowBelowHardRule2 is set', () => {
        expect(
            isValid(withSection('payout', { retainedCushionCents: 199_999 })),
        ).toBe(false);
        expect(
            isValid(
                withSection('payout', {
                    allowBelowHardRule2: true,
                    retainedCushionCents: 199_999,
                }),
            ),
        ).toBe(true);
        expect(
            isValid(withSection('payout', { retainedCushionCents: 300_000 })),
        ).toBe(true);
    });

    it('rejects a negative retained cushion even with the override', () => {
        expect(
            isValid(
                withSection('payout', {
                    allowBelowHardRule2: true,
                    retainedCushionCents: -1,
                }),
            ),
        ).toBe(false);
    });

    it('rejects non-integer or non-positive money amounts', () => {
        const candidates: unknown[] = [
            withSection('funded', { riskCents: 0 }),
            withSection('funded', { riskCents: 250.5 }),
            withSection('funded', { takeProfitCents: -1 }),
            withSection('payout', { requestCents: 0 }),
            withSection('eval', { roundingStepCents: 0 }),
        ];
        for (const candidate of candidates) {
            expect(isValid(candidate)).toBe(false);
        }
    });

    it('rejects trade counts outside their bounds', () => {
        const candidates: unknown[] = [
            withSection('strategy', { tradesPerDayMax: 0 }),
            withSection('strategy', { tradesPerDayMax: MAX_LADDER_SLOTS + 1 }),
            withSection('funded', { tradesPerDayMax: 1.5 }),
            withSection('execution', { maxTradesPerWindow: 0 }),
        ];
        for (const candidate of candidates) {
            expect(isValid(candidate)).toBe(false);
        }
    });

    it('rejects a live cushion percent outside (0, 1]', () => {
        expect(
            isValid(
                withSection('live', {
                    cushionPercent: { postLock: 0.1, preLock: 0 },
                }),
            ),
        ).toBe(false);
        expect(
            isValid(
                withSection('live', {
                    cushionPercent: { postLock: 1.5, preLock: 0.05 },
                }),
            ),
        ).toBe(false);
    });

    it('accepts every funded stop rule kind with valid parameters', () => {
        const rules = [
            { kind: DayStopRuleKind.None },
            { kind: DayStopRuleKind.DayGreen },
            { kind: DayStopRuleKind.FirstWin },
            { k: 2, kind: DayStopRuleKind.AfterKLosses },
            { kind: DayStopRuleKind.AfterTarget, targetCents: 50_000 },
        ];
        for (const stopRule of rules) {
            expect(isValid(withSection('funded', { stopRule: stopRule }))).toBe(
                true,
            );
        }
        expect(
            isValid(withSection('funded', { stopRule: { kind: 'sometimes' } })),
        ).toBe(false);
        expect(
            isValid(
                withSection('funded', {
                    stopRule: {
                        k: 0,
                        kind: DayStopRuleKind.AfterKLosses,
                    },
                }),
            ),
        ).toBe(false);
    });

    it('stores an after-target stop in cents, not in engine dollars', () => {
        expect(
            isValid(
                withSection('funded', {
                    stopRule: {
                        dollars: 500,
                        kind: DayStopRuleKind.AfterTarget,
                    },
                }),
            ),
        ).toBe(false);
        for (const targetCents of [0, -100, 500.5]) {
            expect(
                isValid(
                    withSection('funded', {
                        stopRule: {
                            kind: DayStopRuleKind.AfterTarget,
                            targetCents,
                        },
                    }),
                ),
            ).toBe(false);
        }
    });

    it('caps money amounts at $100,000', () => {
        const atCap: unknown[] = [
            withSection('funded', { riskCents: 10_000_000 }),
            withSection('funded', { takeProfitCents: 10_000_000 }),
            withSection('payout', { requestCents: 10_000_000 }),
            withSection('payout', { retainedCushionCents: 10_000_000 }),
            withSection('funded', {
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 10_000_000,
                },
            }),
        ];
        for (const candidate of atCap) {
            expect(isValid(candidate)).toBe(true);
        }
        const overCap: unknown[] = [
            withSection('funded', { riskCents: 10_000_001 }),
            withSection('funded', { takeProfitCents: 10_000_001 }),
            withSection('payout', { requestCents: 10_000_001 }),
            withSection('payout', { retainedCushionCents: 10_000_001 }),
            withSection('funded', {
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 10_000_001,
                },
            }),
            withSection('funded', { riskCents: Number.MAX_SAFE_INTEGER }),
        ];
        for (const candidate of overCap) {
            expect(isValid(candidate)).toBe(false);
        }
    });

    it('caps the eval rounding step at $1,000', () => {
        expect(
            isValid(withSection('eval', { roundingStepCents: 100_000 })),
        ).toBe(true);
        expect(
            isValid(withSection('eval', { roundingStepCents: 100_001 })),
        ).toBe(false);
    });

    it('caps escalation at 10, rr at 20 and risk multiples at 10', () => {
        const atCap: unknown[] = [
            withSection('eval', {
                generalDerivation: { escalation: 10, firstRungFraction: 0.2 },
            }),
            withSection('strategy', { rr: 20 }),
            withSection('eval', { maxRiskDailyCapMultiple: 10 }),
            withSection('alerts', { fundedNearFloorRiskMultiple: 10 }),
        ];
        for (const candidate of atCap) {
            expect(isValid(candidate)).toBe(true);
        }
        const overCap: unknown[] = [
            withSection('eval', {
                generalDerivation: {
                    escalation: 10.01,
                    firstRungFraction: 0.2,
                },
            }),
            withSection('eval', {
                generalDerivation: {
                    escalation: 1e300,
                    firstRungFraction: 0.2,
                },
            }),
            withSection('strategy', { rr: 20.01 }),
            withSection('strategy', { rr: Infinity }),
            withSection('eval', { maxRiskDailyCapMultiple: 10.01 }),
            withSection('alerts', { fundedNearFloorRiskMultiple: 10.01 }),
        ];
        for (const candidate of overCap) {
            expect(isValid(candidate)).toBe(false);
        }
    });

    it('caps the eval days-remaining warning at 365 and the after-losses count at the ladder slots', () => {
        expect(
            isValid(withSection('alerts', { evalDaysRemainingWarning: 365 })),
        ).toBe(true);
        expect(
            isValid(withSection('alerts', { evalDaysRemainingWarning: 366 })),
        ).toBe(false);
        expect(
            isValid(
                withSection('funded', {
                    stopRule: {
                        k: MAX_LADDER_SLOTS,
                        kind: DayStopRuleKind.AfterKLosses,
                    },
                }),
            ),
        ).toBe(true);
        expect(
            isValid(
                withSection('funded', {
                    stopRule: {
                        k: MAX_LADDER_SLOTS + 1,
                        kind: DayStopRuleKind.AfterKLosses,
                    },
                }),
            ),
        ).toBe(false);
    });

    it('rejects max-risk mode with an rr above the daily cap multiple, the rule EvalMaxRiskRule enforces', () => {
        const draft = structuredClone(DEFAULT_RULEBOOK);
        const maxRisk = (rr: number) => ({
            ...draft,
            eval: {
                ...draft.eval,
                maxRiskDailyCapMultiple: 2,
                mode: EvalSizingMode.MaxRisk,
            },
            strategy: { ...draft.strategy, rr },
        });
        const overshoot = rulebookSchema.safeParse(maxRisk(3));
        expect(overshoot.success).toBe(false);
        expect(overshoot.error?.issues).toEqual([
            expect.objectContaining({
                message:
                    'Hard Rule 4 needs the daily cap multiple (2) to be at least the rr (3), or one win overshoots the daily cap',
                path: ['eval', 'maxRiskDailyCapMultiple'],
            }),
        ]);
        expect(() => new EvalMaxRiskRule(maxRisk(3))).toThrow(
            overshoot.error?.issues[0]?.message ?? 'unreachable',
        );
        expect(isValid(maxRisk(2))).toBe(true);
        expect(isValid(maxRisk(1.5))).toBe(true);
        expect(() => new EvalMaxRiskRule(maxRisk(2))).not.toThrow();
        expect(
            isValid({
                ...maxRisk(3),
                eval: { ...maxRisk(3).eval, mode: EvalSizingMode.Ladder },
            }),
        ).toBe(true);
    });

    it('rejects an unknown schema version, mode or weekday', () => {
        expect(isValid({ ...DEFAULT_RULEBOOK, schemaVersion: 2 })).toBe(false);
        expect(isValid(withSection('eval', { mode: 'yolo' }))).toBe(false);
        expect(isValid(withSection('review', { weekday: 'someday' }))).toBe(
            false,
        );
    });

    it('drops unknown keys', () => {
        const parsed = rulebookSchema.parse({
            ...structuredClone(DEFAULT_RULEBOOK),
            extra: 1,
        }) as unknown as Record<string, unknown>;
        expect('extra' in parsed).toBe(false);
    });
});

describe('rulebookSchema v2 sections', () => {
    it('accepts null for every threshold that is off until the user sets it', () => {
        expect(isValid(structuredClone(DEFAULT_RULEBOOK))).toBe(true);
        expect(
            rulebookSchema.parse(structuredClone(DEFAULT_RULEBOOK)).bankroll
                .lossRiskThreshold,
        ).toBeNull();
    });

    it('bounds the loss-risk threshold to (0, 0.5]', () => {
        expect(
            isValid(withSection('bankroll', { lossRiskThreshold: 0.005 })),
        ).toBe(true);
        expect(
            isValid(withSection('bankroll', { lossRiskThreshold: 0.5 })),
        ).toBe(true);
        for (const value of [0, -0.1, 0.5 + 1e-6, 1]) {
            expect(
                isValid(withSection('bankroll', { lossRiskThreshold: value })),
            ).toBe(false);
        }
    });

    it('bounds every sample minimum to whole numbers from 1 to 10,000', () => {
        for (const key of [
            'minEvalAttempts',
            'minFundedAccounts',
            'minTrades',
            'minClosedRounds',
            'minEndedAccounts',
        ]) {
            expect(isValid(withSection('samples', { [key]: 1 }))).toBe(true);
            expect(isValid(withSection('samples', { [key]: 10_000 }))).toBe(
                true,
            );
            for (const value of [0, 10_001, 1.5, -1]) {
                expect(isValid(withSection('samples', { [key]: value }))).toBe(
                    false,
                );
            }
        }
    });

    it('bounds the daily capacity and accounts per session to whole numbers from 1 to 200', () => {
        for (const key of ['dailyAccountCapacity', 'accountsPerSession']) {
            expect(isValid(withSection('bankroll', { [key]: 1 }))).toBe(true);
            expect(isValid(withSection('bankroll', { [key]: 200 }))).toBe(true);
            for (const value of [0, 201, 2.5]) {
                expect(isValid(withSection('bankroll', { [key]: value }))).toBe(
                    false,
                );
            }
        }
    });

    it('bounds session hours to (0, 16]', () => {
        expect(
            isValid(withSection('bankroll', { sessionHoursPerDay: 2.5 })),
        ).toBe(true);
        expect(
            isValid(withSection('bankroll', { sessionHoursPerDay: 16 })),
        ).toBe(true);
        for (const value of [0, -1, 16.01]) {
            expect(
                isValid(withSection('bankroll', { sessionHoursPerDay: value })),
            ).toBe(false);
        }
    });

    it('stores bankroll, target and alert money as positive whole cents under the $100,000 cap', () => {
        const fields: readonly [keyof RulebookParameters, string][] = [
            ['bankroll', 'objectiveSwitchCents'],
            ['bankroll', 'defaultRoundBudgetCents'],
            ['review', 'monthlyPayoutTargetCents'],
            ['alerts', 'payoutReadyRiskAboveRungCents'],
        ];
        for (const [section, key] of fields) {
            expect(isValid(withSection(section, { [key]: 50_000 }))).toBe(true);
            expect(isValid(withSection(section, { [key]: 10_000_000 }))).toBe(
                true,
            );
            for (const value of [0, -100, 500.5, 10_000_001]) {
                expect(isValid(withSection(section, { [key]: value }))).toBe(
                    false,
                );
            }
        }
    });

    it('bounds the alert fractions to (0, 1]', () => {
        for (const key of [
            'payoutReadyLossFraction',
            'dayLossBankrollFraction',
            'firmProfitConcentrationShare',
        ]) {
            expect(isValid(withSection('alerts', { [key]: 1 }))).toBe(true);
            expect(isValid(withSection('alerts', { [key]: 0.25 }))).toBe(true);
            for (const value of [0, -0.1, 1.01]) {
                expect(isValid(withSection('alerts', { [key]: value }))).toBe(
                    false,
                );
            }
        }
    });

    it('bounds the firm concentration count, the round gap and the target multiple', () => {
        expect(
            isValid(withSection('alerts', { firmProfitConcentrationCount: 3 })),
        ).toBe(true);
        for (const value of [0, 1.5, 201]) {
            expect(
                isValid(
                    withSection('alerts', {
                        firmProfitConcentrationCount: value,
                    }),
                ),
            ).toBe(false);
        }
        expect(isValid(withSection('bankroll', { roundGapDays: 1 }))).toBe(
            true,
        );
        expect(isValid(withSection('bankroll', { roundGapDays: 365 }))).toBe(
            true,
        );
        for (const value of [0, 366, 2.5, null]) {
            expect(
                isValid(withSection('bankroll', { roundGapDays: value })),
            ).toBe(false);
        }
        expect(
            isValid(withSection('review', { targetMonthlyMultiple: 1.5 })),
        ).toBe(true);
        for (const value of [0, -1, Infinity]) {
            expect(
                isValid(
                    withSection('review', { targetMonthlyMultiple: value }),
                ),
            ).toBe(false);
        }
    });

    it('rejects a typical expectancy threshold above the strong one on the typical field', () => {
        const inverted = rulebookSchema.safeParse(
            withSection('plausibility', {
                strongMaxExpectancyR: 0.3,
                typicalMaxExpectancyR: 0.35,
            }),
        );
        expect(inverted.success).toBe(false);
        expect(inverted.error?.issues).toEqual([
            expect.objectContaining({
                path: ['plausibility', 'typicalMaxExpectancyR'],
            }),
        ]);
        expect(
            isValid(
                withSection('plausibility', {
                    strongMaxExpectancyR: 0.3,
                    typicalMaxExpectancyR: 0.3,
                }),
            ),
        ).toBe(true);
        for (const value of [0, -0.1, null]) {
            expect(
                isValid(
                    withSection('plausibility', {
                        typicalMaxExpectancyR: value,
                    }),
                ),
            ).toBe(false);
        }
    });

    it('rejects an unknown risk display unit', () => {
        expect(
            isValid(
                withSection('display', {
                    riskUnit: RiskDisplayUnit.FeeEquivalent,
                }),
            ),
        ).toBe(true);
        expect(isValid(withSection('display', { riskUnit: 'euros' }))).toBe(
            false,
        );
    });

    it('accepts a live-transfer hazard for one firm, which an exhaustive enum record would reject', () => {
        const oneFirm = withSection('liveTransfer', {
            hazardPerPaidPayoutByFirm: { [FirmId.Mffu]: 0.1 },
        });
        expect(rulebookSchema.parse(oneFirm).liveTransfer).toEqual({
            hazardPerPaidPayoutByFirm: { [FirmId.Mffu]: 0.1 },
        });
        expect(
            z
                .record(z.enum(FirmId), z.number())
                .safeParse({ [FirmId.Mffu]: 0.1 }).success,
        ).toBe(false);
    });

    it('bounds a live-transfer hazard to (0, 1) and rejects an unknown firm', () => {
        for (const value of [0, 1, -0.1, 1.5]) {
            expect(
                isValid(
                    withSection('liveTransfer', {
                        hazardPerPaidPayoutByFirm: { [FirmId.Apex]: value },
                    }),
                ),
            ).toBe(false);
        }
        expect(
            isValid(
                withSection('liveTransfer', {
                    hazardPerPaidPayoutByFirm: { notAFirm: 0.1 },
                }),
            ),
        ).toBe(false);
    });
});

describe('withRulebookDefaults and the v2 sections', () => {
    it('reads a stored rulebook from before the v2 sections as the v2 defaults', () => {
        const stored = storedV1();
        expect(Object.keys(stored)).not.toContain('bankroll');
        expect(rulebookSchema.parse(withRulebookDefaults(stored))).toEqual(
            DEFAULT_RULEBOOK,
        );
    });

    it('keeps stored v2 values and fills the rest of the section', () => {
        const merged = rulebookSchema.parse(
            withRulebookDefaults({
                ...storedV1(),
                bankroll: { lossRiskThreshold: 0.01 },
                liveTransfer: {
                    hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: 0.05 },
                },
            }),
        );
        expect(merged.bankroll).toEqual({
            ...DEFAULT_RULEBOOK.bankroll,
            lossRiskThreshold: 0.01,
        });
        expect(merged.liveTransfer.hazardPerPaidPayoutByFirm).toEqual({
            [FirmId.TopStep]: 0.05,
        });
    });

    it('keeps the schema version at 1', () => {
        expect(RULEBOOK_SCHEMA_VERSION).toBe(1);
    });
});

describe('the documented rule label and the v2 sections', () => {
    const edits: readonly [keyof RulebookParameters, string, unknown][] = [
        ['bankroll', 'objectiveSwitchCents', 500_000],
        ['bankroll', 'lossRiskThreshold', 0.005],
        ['bankroll', 'dailyAccountCapacity', 10],
        ['bankroll', 'sessionHoursPerDay', 3],
        ['bankroll', 'accountsPerSession', 5],
        ['bankroll', 'defaultRoundBudgetCents', 200_000],
        ['bankroll', 'roundGapDays', 7],
        ['samples', 'minEvalAttempts', 50],
        ['samples', 'minFundedAccounts', 50],
        ['samples', 'minTrades', 200],
        ['samples', 'minClosedRounds', 3],
        ['samples', 'minEndedAccounts', 4],
        ['review', 'monthlyPayoutTargetCents', 1_000_000],
        ['review', 'targetMonthlyMultiple', 2],
        ['plausibility', 'typicalMaxExpectancyR', 0.25],
        ['plausibility', 'strongMaxExpectancyR', 0.4],
        ['alerts', 'payoutReadyLossFraction', 0.5],
        ['alerts', 'payoutReadyRiskAboveRungCents', 10_000],
        ['alerts', 'dayLossBankrollFraction', 0.1],
        ['alerts', 'firmProfitConcentrationCount', 3],
        ['alerts', 'firmProfitConcentrationShare', 0.5],
        ['display', 'riskUnit', RiskDisplayUnit.FeeEquivalent],
        ['display', 'nextPayoutHighlightDays', 14],
        ['liveTransfer', 'hazardPerPaidPayoutByFirm', { [FirmId.Mffu]: 0.1 }],
    ];

    it.each(edits)(
        'stays your documented rule when %s.%s is edited',
        (section, key, value) => {
            const edited = rulebookSchema.parse(
                withSection(section, { [key]: value }),
            );
            expect(Reflect.get(edited[section] as object, key)).toEqual(value);
            expect(documentedRuleLabel(rulebookDeviation(edited))).toBe(
                documentedRuleLabel([]),
            );
        },
    );
});

describe('display.nextPayoutHighlightDays (PT-68b, F-V18)', () => {
    it('defaults to a seven calendar day window', () => {
        expect(DEFAULT_RULEBOOK.display.nextPayoutHighlightDays).toBe(7);
    });

    it.each([1, 7, 14, 365])('accepts a window of %s days', (days) => {
        expect(
            rulebookSchema.parse(
                withSection('display', { nextPayoutHighlightDays: days }),
            ).display.nextPayoutHighlightDays,
        ).toBe(days);
    });

    it.each([0, -1, 1.5, 366, null, '7'])('rejects a window of %s', (days) => {
        expect(
            isValid(withSection('display', { nextPayoutHighlightDays: days })),
        ).toBe(false);
    });

    it('fills the window for a stored rulebook whose display section predates it', () => {
        const stored = {
            ...structuredClone(DEFAULT_RULEBOOK),
            display: { riskUnit: RiskDisplayUnit.FeeEquivalent },
        };
        const merged = rulebookSchema.parse(withRulebookDefaults(stored));
        expect(merged.display).toEqual({
            nextPayoutHighlightDays: 7,
            riskUnit: RiskDisplayUnit.FeeEquivalent,
        });
    });
});

describe('rulebookSchema typing', () => {
    it('keeps its object shape visible and its output assignable to RulebookParameters', () => {
        expect(Object.keys(rulebookSchema.shape).toSorted(byName)).toEqual(
            Object.keys(DEFAULT_RULEBOOK).toSorted(byName),
        );
        expectTypeOf<
            z.output<typeof rulebookSchema>
        >().toExtend<RulebookParameters>();
    });
});

describe('the plausibility thresholds contract', () => {
    it('defines the thresholds type once, in the economics library', () => {
        expect(filesDefining(/interface PlausibilityThresholds\b/)).toEqual([
            'economics/EdgePlausibility.ts',
        ]);
        expect(
            readFileSync(
                path.join(PROP_CALCULATOR_SOURCE, 'advisor', 'index.ts'),
                'utf8',
            ),
        ).not.toMatch(/\bPlausibilityThresholds\b/);
        expectTypeOf<RulebookParameters['plausibility']>().toEqualTypeOf<
            Readonly<PlausibilityThresholds>
        >();
    });

    it('feeds the default plausibility section straight into the edge plausibility check', () => {
        expect(defaultPlausibilityAt(0.4, 2)).toBe(PlausibilityLevel.Typical);
        expect(defaultPlausibilityAt(0.7, 1)).toBe(
            PlausibilityLevel.Implausible,
        );
    });
});

describe('fundedStopRuleToDayStopRule', () => {
    it('converts an after-target stop from cents to engine dollars', () => {
        expect(
            fundedStopRuleToDayStopRule({
                kind: DayStopRuleKind.AfterTarget,
                targetCents: 50_000,
            }),
        ).toEqual({ dollars: 500, kind: DayStopRuleKind.AfterTarget });
        expect(
            fundedStopRuleToDayStopRule({
                kind: DayStopRuleKind.AfterTarget,
                targetCents: 12_345,
            }),
        ).toEqual({ dollars: 123.45, kind: DayStopRuleKind.AfterTarget });
    });

    it('passes every other stop rule through unchanged', () => {
        const rules: readonly FundedStopRule[] = [
            { kind: DayStopRuleKind.None },
            { kind: DayStopRuleKind.DayGreen },
            { kind: DayStopRuleKind.FirstWin },
            { k: 2, kind: DayStopRuleKind.AfterKLosses },
        ];
        for (const rule of rules) {
            expect(fundedStopRuleToDayStopRule(rule)).toEqual(rule);
        }
    });

    it('converts the default funded stop rule', () => {
        expect(
            fundedStopRuleToDayStopRule(DEFAULT_RULEBOOK.funded.stopRule),
        ).toEqual({ kind: DayStopRuleKind.None });
    });
});
