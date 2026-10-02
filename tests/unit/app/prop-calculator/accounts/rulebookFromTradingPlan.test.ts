import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    FieldKind,
    formPathOf,
    parseText,
    readRulebookDraft,
    rulebookFormSchema,
    rulebookToFormValues,
    TEXT_FIELDS,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFormValues';
import {
    describeTradingPlanImportChange,
    rulebookFromTradingPlan,
    type TradingPlanImportChange,
    TradingPlanImportField,
    TradingPlanImportOutcome,
    type TradingPlanRisk,
    tradingPlanSourceFrom,
    TradingPlanSourceKind,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFromTradingPlan';
import { DayStopRuleKind, FirmId, fraction } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    EvalSizingMode,
    LadderFractionSource,
    ReviewWeekday,
    RiskDisplayUnit,
    rulebookDeviation,
    type RulebookParameters,
    rulebookSchema,
    RuleSource,
} from '~/lib/prop-calculator/advisor';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';

const EM_DASH = String.fromCodePoint(0x20_14);

function changeOf(
    changes: readonly TradingPlanImportChange[],
    field: TradingPlanImportField,
): TradingPlanImportChange {
    const change = changes.find((candidate) => candidate.field === field);
    if (change === undefined) throw new Error(`no change for ${field}`);
    return change;
}

function customRulebook(): RulebookParameters {
    return {
        ...structuredClone(DEFAULT_RULEBOOK),
        execution: { maxTradesPerWindow: 2 },
        funded: {
            ...DEFAULT_RULEBOOK.funded,
            riskCents: 30_000,
            takeProfitCents: 60_000,
        },
    };
}

function issuePaths(values: unknown): string[] {
    const parsed = rulebookFormSchema.safeParse(values);
    return parsed.success
        ? []
        : parsed.error.issues.map((issue) => issue.path.join('.'));
}

function rewardMultiple(rulebook: RulebookParameters): number {
    return rulebook.funded.takeProfitCents / rulebook.funded.riskCents;
}

function risk(change: Partial<TradingPlanRisk>): TradingPlanRisk {
    return { ...DEFAULT_PLAN.risk, ...change };
}

describe('rulebookFromTradingPlan', () => {
    it('maps fundedDollars to funded risk in cents and maxTradesPerWindow to execution', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200, maxTradesPerWindow: 2 }),
        );
        expect(result.rulebook.funded.riskCents).toBe(20_000);
        expect(result.rulebook.execution.maxTradesPerWindow).toBe(2);
        expect(
            changeOf(result.changes, TradingPlanImportField.FundedRisk),
        ).toMatchObject({
            importedValue: 20_000,
            outcome: TradingPlanImportOutcome.Applied,
            planValue: 200,
            rulebookValue: 25_000,
            source: RuleSource.HardRule5,
        });
        expect(
            changeOf(result.changes, TradingPlanImportField.MaxTradesPerWindow),
        ).toMatchObject({
            importedValue: 2,
            outcome: TradingPlanImportOutcome.Applied,
            planValue: 2,
            rulebookValue: 1,
            source: RuleSource.HardRule6,
        });
        expect(result.hasChanges).toBe(true);
        expect(rulebookSchema.safeParse(result.rulebook).success).toBe(true);
    });

    it('leaves every other rulebook parameter untouched apart from the scaled funded take profit', () => {
        const base = customRulebook();
        const result = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 150, maxTradesPerWindow: 3 }),
        );
        expect(result.rulebook).toEqual({
            ...base,
            execution: { maxTradesPerWindow: 3 },
            funded: {
                ...base.funded,
                riskCents: 15_000,
                takeProfitCents: 30_000,
            },
        });
    });

    it('keeps the v2 sections, set or at their defaults, through an import', () => {
        const fromDefaults = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 150, maxTradesPerWindow: 3 }),
        );
        expect(fromDefaults.rulebook.bankroll.roundGapDays).toBe(14);
        expect(fromDefaults.rulebook.samples).toEqual(DEFAULT_RULEBOOK.samples);
        expect(fromDefaults.rulebook.plausibility).toEqual(
            DEFAULT_RULEBOOK.plausibility,
        );
        const base: RulebookParameters = {
            ...customRulebook(),
            bankroll: {
                ...DEFAULT_RULEBOOK.bankroll,
                lossRiskThreshold: 0.01,
            },
            liveTransfer: { hazardPerPaidPayoutByFirm: { mffu: 0.1 } },
        };
        const imported = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 150, maxTradesPerWindow: 3 }),
        );
        expect(imported.rulebook.bankroll.lossRiskThreshold).toBe(0.01);
        expect(imported.rulebook.liveTransfer).toEqual({
            hazardPerPaidPayoutByFirm: { mffu: 0.1 },
        });
        expect(imported.deviation.after).toEqual(
            rulebookDeviation({
                ...base,
                execution: { maxTradesPerWindow: 3 },
                funded: {
                    ...base.funded,
                    riskCents: 15_000,
                    takeProfitCents: 30_000,
                },
            }),
        );
    });

    it('does not mutate the rulebook it was given', () => {
        const base = customRulebook();
        const snapshot = structuredClone(base);
        rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 100, maxTradesPerWindow: 4 }),
        );
        expect(base).toEqual(snapshot);
    });

    it('never maps evalDollars, since the rulebook stores no eval risk', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ evalDollars: 900 }),
        );
        const evalChange = changeOf(
            result.changes,
            TradingPlanImportField.EvalRisk,
        );
        expect(evalChange).toEqual({
            field: TradingPlanImportField.EvalRisk,
            outcome: TradingPlanImportOutcome.NotStored,
            planValue: 900,
            source: RuleSource.HardRule3,
        });
        expect(result.rulebook).toEqual(DEFAULT_RULEBOOK);
        expect(result.hasChanges).toBe(false);
    });

    it('explains the ignored eval risk with Hard Rule 3', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ evalDollars: 900 }),
        );
        const text = describeTradingPlanImportChange(
            changeOf(result.changes, TradingPlanImportField.EvalRisk),
        );
        expect(text).toContain(
            'ignored: Hard Rule 3 sizes evals to the maximum allowed',
        );
        expect(text).toContain('$900');
    });

    it('treats an eval risk of zero as not stored too, not as a zero value', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ evalDollars: 0 }),
        );
        expect(
            changeOf(result.changes, TradingPlanImportField.EvalRisk).outcome,
        ).toBe(TradingPlanImportOutcome.NotStored);
    });

    it('ignores zero values and keeps the rulebook value', () => {
        const base = customRulebook();
        const result = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 0, maxTradesPerWindow: 0 }),
        );
        expect(result.rulebook).toEqual(base);
        expect(result.hasChanges).toBe(false);
        for (const field of [
            TradingPlanImportField.FundedRisk,
            TradingPlanImportField.MaxTradesPerWindow,
        ]) {
            const change = changeOf(result.changes, field);
            expect(change.outcome).toBe(TradingPlanImportOutcome.IgnoredZero);
            expect(change).not.toHaveProperty('importedValue');
        }
        expect(
            describeTradingPlanImportChange(
                changeOf(result.changes, TradingPlanImportField.FundedRisk),
            ),
        ).toContain('$300');
    });

    it('reports values equal to the rulebook as unchanged', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            DEFAULT_PLAN.risk,
        );
        expect(result.rulebook).toEqual(DEFAULT_RULEBOOK);
        expect(result.hasChanges).toBe(false);
        expect(
            changeOf(result.changes, TradingPlanImportField.FundedRisk).outcome,
        ).toBe(TradingPlanImportOutcome.Unchanged);
        expect(
            changeOf(result.changes, TradingPlanImportField.MaxTradesPerWindow)
                .outcome,
        ).toBe(TradingPlanImportOutcome.Unchanged);
    });

    it.each([
        ['a fractional trade count', { maxTradesPerWindow: 1.5 }],
        [
            'a trade count above the ladder slot limit',
            { maxTradesPerWindow: 1000 },
        ],
        ['a negative trade count', { maxTradesPerWindow: -1 }],
    ])('rejects %s and keeps the rulebook value', (_label, change) => {
        const result = rulebookFromTradingPlan(DEFAULT_RULEBOOK, risk(change));
        const row = changeOf(
            result.changes,
            TradingPlanImportField.MaxTradesPerWindow,
        );
        expect(row.outcome).toBe(TradingPlanImportOutcome.Rejected);
        expect(row).not.toHaveProperty('importedValue');
        expect(result.rulebook.execution.maxTradesPerWindow).toBe(1);
        expect(describeTradingPlanImportChange(row)).toMatch(/^rejected: /);
    });

    it.each([
        ['a fraction of a cent', 250.555],
        ['a negative amount', -250],
        ['an amount above the rulebook maximum', 100_001],
        ['a non-finite amount', NaN],
        ['an infinite amount', Infinity],
    ])('rejects a funded risk of %s', (_label, fundedDollars) => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars }),
        );
        const row = changeOf(result.changes, TradingPlanImportField.FundedRisk);
        expect(row.outcome).toBe(TradingPlanImportOutcome.Rejected);
        expect(row).not.toHaveProperty('importedValue');
        expect(result.rulebook.funded.riskCents).toBe(25_000);
        expect(result.hasChanges).toBe(false);
    });

    it('applies the valid field when the other one is rejected', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200, maxTradesPerWindow: 2.5 }),
        );
        expect(result.rulebook.funded.riskCents).toBe(20_000);
        expect(result.rulebook.execution.maxTradesPerWindow).toBe(1);
        expect(result.hasChanges).toBe(true);
    });

    it('lists the changes in a stable order: funded risk, trades per window, eval risk', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            DEFAULT_PLAN.risk,
        );
        expect(result.changes.map((change) => change.field)).toEqual([
            TradingPlanImportField.FundedRisk,
            TradingPlanImportField.MaxTradesPerWindow,
            TradingPlanImportField.EvalRisk,
        ]);
    });

    it('lists the scaled take profit right after the funded risk it follows', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200 }),
        );
        expect(result.changes.map((change) => change.field)).toEqual([
            TradingPlanImportField.FundedRisk,
            TradingPlanImportField.FundedTakeProfit,
            TradingPlanImportField.MaxTradesPerWindow,
            TradingPlanImportField.EvalRisk,
        ]);
    });

    it('narrows each outcome to the values it carries', () => {
        type ChangeWith<Outcome extends TradingPlanImportOutcome> = Extract<
            TradingPlanImportChange,
            { outcome: Outcome }
        >;
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Applied>['importedValue']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Applied>['rulebookValue']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Unchanged>['importedValue']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Rejected>['rejection']
        >().toEqualTypeOf<string>();
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Scaled>['rewardMultiple']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.NotStored>
        >().not.toHaveProperty('rulebookValue');
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.Rejected>
        >().not.toHaveProperty('importedValue');
        expectTypeOf<
            ChangeWith<TradingPlanImportOutcome.IgnoredZero>
        >().not.toHaveProperty('importedValue');
    });
});

describe('rulebookFromTradingPlan funded reward multiple', () => {
    it('scales the funded take profit so the funded reward multiple stays the same', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200 }),
        );
        expect(result.rulebook.funded.riskCents).toBe(20_000);
        expect(result.rulebook.funded.takeProfitCents).toBe(40_000);
        expect(rewardMultiple(result.rulebook)).toBe(
            rewardMultiple(DEFAULT_RULEBOOK),
        );
        expect(
            changeOf(result.changes, TradingPlanImportField.FundedTakeProfit),
        ).toEqual({
            field: TradingPlanImportField.FundedTakeProfit,
            importedValue: 40_000,
            outcome: TradingPlanImportOutcome.Scaled,
            rewardMultiple: 2,
            rulebookValue: 50_000,
            source: RuleSource.HardRule5,
        });
        expect(rulebookSchema.safeParse(result.rulebook).success).toBe(true);
    });

    it('keeps a custom reward multiple too, not the skill 2R', () => {
        const base: RulebookParameters = {
            ...structuredClone(DEFAULT_RULEBOOK),
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                riskCents: 20_000,
                takeProfitCents: 60_000,
            },
        };
        const result = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 100 }),
        );
        expect(result.rulebook.funded.takeProfitCents).toBe(30_000);
        expect(rewardMultiple(result.rulebook)).toBe(3);
    });

    it('rounds a scaled take profit to the nearest whole cent', () => {
        const base: RulebookParameters = {
            ...structuredClone(DEFAULT_RULEBOOK),
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                riskCents: 30_000,
                takeProfitCents: 50_000,
            },
        };
        const result = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 200 }),
        );
        expect(result.rulebook.funded.takeProfitCents).toBe(33_333);
        expect(rewardMultiple(result.rulebook)).toBeCloseTo(
            rewardMultiple(base),
            4,
        );
    });

    it('states the take profit change and the kept reward multiple in the preview', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200 }),
        );
        const text = describeTradingPlanImportChange(
            changeOf(result.changes, TradingPlanImportField.FundedTakeProfit),
        );
        expect(text).toContain('$500 becomes $400');
        expect(text).toContain('2R');
    });

    it('adds no take profit row when the funded risk does not change', () => {
        for (const fundedDollars of [0, 250, 250.555]) {
            const result = rulebookFromTradingPlan(
                DEFAULT_RULEBOOK,
                risk({ fundedDollars }),
            );
            expect(
                result.changes.some(
                    (change) =>
                        change.field ===
                        TradingPlanImportField.FundedTakeProfit,
                ),
            ).toBe(false);
            expect(result.rulebook.funded.takeProfitCents).toBe(50_000);
        }
    });

    it('rejects the funded risk when the scaled take profit is not a valid rulebook value', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 60_000 }),
        );
        const row = changeOf(result.changes, TradingPlanImportField.FundedRisk);
        expect(row.outcome).toBe(TradingPlanImportOutcome.Rejected);
        expect(describeTradingPlanImportChange(row)).toContain('take profit');
        expect(result.rulebook.funded).toEqual(DEFAULT_RULEBOOK.funded);
        expect(result.hasChanges).toBe(false);
    });

    it('rejects a funded risk whose scaled take profit leaves the safe integer range instead of throwing', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 50_000_000_000_000 }),
        );
        const row = changeOf(result.changes, TradingPlanImportField.FundedRisk);
        expect(row.outcome).toBe(TradingPlanImportOutcome.Rejected);
        expect(result.rulebook.funded).toEqual(DEFAULT_RULEBOOK.funded);
    });
});

describe('rulebookFromTradingPlan deviation diff', () => {
    it('shows the deviations the import adds against the skill defaults', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 200, maxTradesPerWindow: 2 }),
        );
        expect(result.deviation.before).toEqual([]);
        expect(result.deviation.after).toEqual(
            rulebookDeviation(result.rulebook),
        );
        expect(result.deviation.added).toEqual([
            RuleSource.HardRule5,
            RuleSource.HardRule6,
        ]);
        expect(result.deviation.cleared).toEqual([]);
    });

    it('shows the deviations the import clears when the plan matches the skill', () => {
        const result = rulebookFromTradingPlan(
            customRulebook(),
            DEFAULT_PLAN.risk,
        );
        expect(result.deviation.before).toEqual([
            RuleSource.HardRule5,
            RuleSource.HardRule6,
        ]);
        expect(result.deviation.after).toEqual([]);
        expect(result.deviation.added).toEqual([]);
        expect(result.deviation.cleared).toEqual([
            RuleSource.HardRule5,
            RuleSource.HardRule6,
        ]);
    });

    it('keeps deviations the import does not touch in both before and after', () => {
        const base: RulebookParameters = {
            ...structuredClone(DEFAULT_RULEBOOK),
            payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 100_000 },
        };
        const result = rulebookFromTradingPlan(
            base,
            risk({ fundedDollars: 200 }),
        );
        expect(result.deviation.before).toEqual([RuleSource.PayoutSize]);
        expect(result.deviation.after).toEqual([
            RuleSource.HardRule5,
            RuleSource.PayoutSize,
        ]);
        expect(result.deviation.added).toEqual([RuleSource.HardRule5]);
        expect(result.deviation.cleared).toEqual([]);
    });
});

describe('describeTradingPlanImportChange', () => {
    it('states the plan value and the rulebook value it replaces', () => {
        const result = rulebookFromTradingPlan(
            DEFAULT_RULEBOOK,
            risk({ fundedDollars: 175, maxTradesPerWindow: 3 }),
        );
        const funded = describeTradingPlanImportChange(
            changeOf(result.changes, TradingPlanImportField.FundedRisk),
        );
        expect(funded).toContain('$250');
        expect(funded).toContain('$175');
        const trades = describeTradingPlanImportChange(
            changeOf(result.changes, TradingPlanImportField.MaxTradesPerWindow),
        );
        expect(trades).toContain('1');
        expect(trades).toContain('3');
    });

    it('never uses an em dash', () => {
        for (const result of [
            rulebookFromTradingPlan(
                customRulebook(),
                risk({
                    evalDollars: 0,
                    fundedDollars: 0,
                    maxTradesPerWindow: 7.5,
                }),
            ),
            rulebookFromTradingPlan(
                DEFAULT_RULEBOOK,
                risk({ fundedDollars: 200, maxTradesPerWindow: 1 }),
            ),
            rulebookFromTradingPlan(
                DEFAULT_RULEBOOK,
                risk({ fundedDollars: 60_000 }),
            ),
        ]) {
            for (const change of result.changes) {
                expect(describeTradingPlanImportChange(change)).not.toContain(
                    EM_DASH,
                );
            }
        }
        expect(documentedRuleLabel([RuleSource.HardRule2])).not.toContain(
            EM_DASH,
        );
    });
});

describe('documentedRuleLabel', () => {
    it('labels a rulebook that matches the skill as the documented rule', () => {
        expect(documentedRuleLabel([])).toBe('your documented rule');
    });

    it('names every deviation in a custom rule label', () => {
        expect(
            documentedRuleLabel([RuleSource.HardRule5, RuleSource.HardRule6]),
        ).toBe('your custom rule (differs from Hard Rule 5, Hard Rule 6)');
    });
});

describe('tradingPlanSourceFrom', () => {
    it('reports a missing plan when the user has no trading plan row', () => {
        expect(tradingPlanSourceFrom(undefined)).toEqual({
            kind: TradingPlanSourceKind.Missing,
        });
    });

    it('passes only the name and the risk section of a readable plan', () => {
        const source = tradingPlanSourceFrom({
            config: DEFAULT_PLAN,
            name: 'My trading plan',
        });
        expect(source).toEqual({
            kind: TradingPlanSourceKind.Ready,
            name: 'My trading plan',
            risk: DEFAULT_PLAN.risk,
        });
    });

    it('reports an unreadable plan instead of importing a config that fails its schema', () => {
        const source = tradingPlanSourceFrom({
            config: {
                ...DEFAULT_PLAN,
                risk: { ...DEFAULT_PLAN.risk, fundedDollars: -5 },
            },
            name: 'Broken plan',
        });
        expect(source).toEqual({
            kind: TradingPlanSourceKind.Unreadable,
            name: 'Broken plan',
        });
    });

    it('reports an unreadable plan when the stored config is not an object', () => {
        expect(
            tradingPlanSourceFrom({ config: null, name: 'Empty plan' }).kind,
        ).toBe(TradingPlanSourceKind.Unreadable);
    });
});

describe('rulebook form values', () => {
    it('round-trips the skill defaults with no deviation', () => {
        const parsed = rulebookFormSchema.parse(
            rulebookToFormValues(DEFAULT_RULEBOOK),
        );
        expect(parsed).toEqual({
            ...DEFAULT_RULEBOOK,
            samples: { ...DEFAULT_RULEBOOK.samples, minEndedAccounts: null },
        });
        expect(rulebookDeviation(parsed)).toEqual([]);
    });

    it('round-trips a rulebook with every parameter changed', () => {
        const custom: RulebookParameters = {
            alerts: {
                dayLossBankrollFraction: 0.15,
                evalDaysRemainingWarning: 3,
                evalNearFloorDrawdownFraction: 0.07,
                firmProfitConcentrationCount: 4,
                firmProfitConcentrationShare: 0.55,
                fundedNearFloorRiskMultiple: 2.5,
                payoutReadyLossFraction: 0.35,
                payoutReadyRiskAboveRungCents: 7550,
            },
            bankroll: {
                accountsPerSession: 6,
                dailyAccountCapacity: 15,
                defaultRoundBudgetCents: 300_025,
                lossRiskThreshold: 0.0125,
                objectiveSwitchCents: 400_000,
                roundGapDays: 21,
                sessionHoursPerDay: 3.5,
            },
            display: {
                nextPayoutHighlightDays: 21,
                riskUnit: RiskDisplayUnit.EvAtStake,
            },
            eval: {
                generalDerivation: {
                    escalation: 1.25,
                    firstRungFraction: 0.175,
                },
                ladderFractionSource: LadderFractionSource.MffRapidEodSearch,
                maxRiskDailyCapMultiple: 3,
                mffSearchFractions: [0.25, 0.25, 0.5],
                mode: EvalSizingMode.MaxRisk,
                roundingStepCents: 2550,
            },
            execution: { maxTradesPerWindow: 2 },
            funded: {
                riskCents: 20_050,
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 75_025,
                },
                takeProfitCents: 40_100,
                tradesPerDayMax: 3,
            },
            live: {
                cushionPercent: {
                    postLock: fraction(0.12),
                    preLock: fraction(0.035),
                },
            },
            liveTransfer: {
                hazardPerPaidPayoutByFirm: {
                    [FirmId.Apex]: 0.2,
                    [FirmId.Tradeify]: 0.035,
                },
            },
            payout: {
                allowBelowHardRule2: true,
                requestCents: 100_000,
                retainedCushionCents: 150_000,
            },
            plausibility: {
                strongMaxExpectancyR: 0.45,
                typicalMaxExpectancyR: 0.2,
            },
            review: {
                fundedStaleDays: 10,
                monthlyPayoutTargetCents: 750_000,
                targetMonthlyMultiple: 2.25,
                weekday: ReviewWeekday.Friday,
            },
            samples: {
                minClosedRounds: 4,
                minEndedAccounts: 12,
                minEvalAttempts: 30,
                minFundedAccounts: 20,
                minTrades: 150,
            },
            schemaVersion: DEFAULT_RULEBOOK.schemaVersion,
            strategy: { rr: 2.5, tradesPerDayMax: 5, winrate: 0.37 },
        };
        expect(rulebookSchema.parse(custom)).toEqual(custom);
        expect(rulebookFormSchema.parse(rulebookToFormValues(custom))).toEqual(
            custom,
        );
    });

    it('round-trips the after-k-losses stop rule', () => {
        const custom: RulebookParameters = {
            ...structuredClone(DEFAULT_RULEBOOK),
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            },
            samples: { ...DEFAULT_RULEBOOK.samples, minEndedAccounts: null },
        };
        expect(rulebookFormSchema.parse(rulebookToFormValues(custom))).toEqual(
            custom,
        );
    });

    it('enters the after-target stop in dollars and stores cents', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        const parsed = rulebookFormSchema.parse({
            ...values,
            funded: {
                ...values.funded,
                stopRule: {
                    k: '',
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: '600.50',
                },
            },
        });
        expect(parsed.funded.stopRule).toEqual({
            kind: DayStopRuleKind.AfterTarget,
            targetCents: 60_050,
        });
    });

    it('enters percentages and stores fractions', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(values.strategy.winrate).toBe('40');
        expect(values.live.cushionPercent.preLock).toBe('5');
        const parsed = rulebookFormSchema.parse({
            ...values,
            strategy: { ...values.strategy, winrate: '45' },
        });
        expect(parsed.strategy.winrate).toBe(0.45);
    });

    it('rejects a retained cushion below Hard Rule 2 on that field unless the override is on', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        const below = {
            ...values,
            payout: { ...values.payout, retainedCushionCents: '1500' },
        };
        expect(issuePaths(below)).toEqual(['payout.retainedCushionCents']);
        const allowed = rulebookFormSchema.parse({
            ...below,
            payout: { ...below.payout, allowBelowHardRule2: true },
        });
        expect(allowed.payout.retainedCushionCents).toBe(150_000);
        expect(rulebookDeviation(allowed)).toContain(RuleSource.HardRule2);
    });

    it('rejects a Hard Rule 4 overshoot on the daily cap multiple', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths({
                ...values,
                eval: {
                    ...values.eval,
                    maxRiskDailyCapMultiple: '1.5',
                    mode: EvalSizingMode.MaxRisk,
                },
            }),
        ).toEqual(['eval.maxRiskDailyCapMultiple']);
    });

    it('reports unreadable text on the field it came from', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths({
                ...values,
                execution: { maxTradesPerWindow: '1.5' },
                funded: { ...values.funded, riskCents: 'abc' },
                strategy: { ...values.strategy, winrate: '' },
            }).toSorted((a, b) => a.localeCompare(b)),
        ).toEqual([
            'execution.maxTradesPerWindow',
            'funded.riskCents',
            'strategy.winrate',
        ]);
    });

    it('reports ladder fractions that do not sum to 1 on the fractions field', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths({
                ...values,
                eval: { ...values.eval, mffSearchFractions: '0.2, 0.3' },
            }),
        ).toEqual(['eval.mffSearchFractions']);
        expect(
            issuePaths({
                ...values,
                eval: { ...values.eval, mffSearchFractions: '0.5, -0.5, 1' },
            }),
        ).toEqual(['eval.mffSearchFractions']);
    });

    it('does not read the k field unless the stop rule needs it', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths({
                ...values,
                funded: {
                    ...values.funded,
                    stopRule: {
                        k: 'junk',
                        kind: DayStopRuleKind.None,
                        targetCents: 'junk',
                    },
                },
            }),
        ).toEqual([]);
    });
});

describe('rulebook form codec module', () => {
    it('lives outside the client view so server code and tests can import it', () => {
        const source = readFileSync(
            new URL(
                '../../../../../src/app/(app)/prop-calculator/accounts/rulebook/rulebookFormValues.ts',
                import.meta.url,
            ),
            'utf8',
        );
        expect(source).not.toContain("'use client'");
    });

    it('parses every field kind from its form text', () => {
        expect(parseText(FieldKind.Count, ' 3 ')).toEqual({
            ok: true,
            value: 3,
        });
        expect(parseText(FieldKind.Count, '1.5')).toEqual({
            message: 'Enter a whole number',
            ok: false,
        });
        expect(parseText(FieldKind.Decimal, '2.5')).toEqual({
            ok: true,
            value: 2.5,
        });
        expect(parseText(FieldKind.Percent, '12.5')).toEqual({
            ok: true,
            value: 0.125,
        });
        expect(parseText(FieldKind.Money, '600.50')).toEqual({
            ok: true,
            value: 60_050,
        });
        expect(parseText(FieldKind.Money, '')).toEqual({
            message: 'Enter a dollar amount',
            ok: false,
        });
        expect(parseText(FieldKind.Fractions, '0.2, 0.8')).toEqual({
            ok: true,
            value: [0.2, 0.8],
        });
        expect(parseText(FieldKind.Fractions, '0.2,').ok).toBe(false);
    });

    it('maps a schema issue path onto a form field, or the form root', () => {
        expect(formPathOf(['payout', 'retainedCushionCents'])).toEqual([
            'payout',
            'retainedCushionCents',
        ]);
        expect(formPathOf(['eval', 'mffSearchFractions', 2])).toEqual([
            'eval',
            'mffSearchFractions',
        ]);
        expect(formPathOf(['funded', 'stopRule', 'targetCents'])).toEqual([
            'funded',
            'stopRule',
            'targetCents',
        ]);
        expect(formPathOf(['schemaVersion'])).toEqual(['root']);
        expect(formPathOf([])).toEqual(['root']);
    });

    it('reads a draft with one issue per unreadable text field', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        const clean = readRulebookDraft(values);
        expect(clean.issues).toEqual([]);
        expect(rulebookSchema.parse(clean.candidate)).toEqual({
            ...DEFAULT_RULEBOOK,
            samples: { ...DEFAULT_RULEBOOK.samples, minEndedAccounts: null },
        });
        const broken = readRulebookDraft({
            ...values,
            funded: { ...values.funded, riskCents: 'abc' },
        });
        expect(broken.issues.map((issue) => issue.path)).toEqual([
            ['funded', 'riskCents'],
        ]);
    });

    it('describes every text field with its kind and skill source', () => {
        expect(TEXT_FIELDS['funded.riskCents']).toMatchObject({
            kind: FieldKind.Money,
            source: RuleSource.HardRule5,
        });
        expect(
            TEXT_FIELDS['alerts.evalDaysRemainingWarning'].source,
        ).toBeNull();
        const defaults = rulebookToFormValues(DEFAULT_RULEBOOK);
        for (const spec of Object.values(TEXT_FIELDS)) {
            expect(typeof spec.read(defaults)).toBe('string');
        }
    });
});
