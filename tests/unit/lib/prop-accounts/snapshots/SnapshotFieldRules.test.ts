import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import { AccountStage, compareText } from '~/lib/prop-accounts';
import * as alerts from '~/lib/prop-accounts/alerts';
import * as core from '~/lib/prop-accounts/core';
import * as metrics from '~/lib/prop-accounts/metrics';
import * as snapshots from '~/lib/prop-accounts/snapshots';
import {
    missingSnapshotFields,
    SnapshotField,
    SnapshotFieldRequirement,
    type SnapshotFieldRule,
    snapshotFieldRules,
    SnapshotInputKind,
} from '~/lib/prop-accounts/snapshots';
import {
    ALL_FIRMS,
    DrawdownKind,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

const FUNDED_ONLY_FIELDS: readonly SnapshotField[] = [
    SnapshotField.QualifyingDaysSinceLastPayout,
    SnapshotField.BalanceAtLastPayout,
    SnapshotField.LastPayoutOn,
    SnapshotField.FloorAtLastPayout,
    SnapshotField.CumulativePayout,
    SnapshotField.CycleBestDayProfit,
];

const SNAPSHOTS_DIRECTORY = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-accounts',
    'snapshots',
);

function evalKind(plan: Plan): DrawdownKind {
    return plan.drawdownFor(TradingPhase.Eval).kind;
}

function filledOnly(
    fields: readonly SnapshotField[],
): (field: SnapshotField) => boolean {
    const filled = new Set(fields);
    return (field) => filled.has(field);
}

function findPlan(isMatch: (plan: Plan) => boolean): Plan {
    const plan = ALL_PLANS.find(isMatch);
    if (plan === undefined) throw new Error('no plan matches the predicate');
    return plan;
}

function ruleOf(
    rules: readonly SnapshotFieldRule[],
    field: SnapshotField,
): SnapshotFieldRule {
    const rule = rules.find((r) => r.field === field);
    if (rule === undefined) throw new Error(`no rule for ${field}`);
    return rule;
}

const intradayPlan = findPlan(
    (p) => evalKind(p) === DrawdownKind.IntradayTrailing,
);
const eodPlan = findPlan((p) => evalKind(p) === DrawdownKind.EodTrailing);

describe('snapshotFieldRules', () => {
    it('always requires the date, balance and trading days', () => {
        for (const stage of Object.values(AccountStage)) {
            const rules = snapshotFieldRules(eodPlan, stage);
            for (const field of [
                SnapshotField.AsOf,
                SnapshotField.Balance,
                SnapshotField.TradingDays,
            ]) {
                expect(ruleOf(rules, field).requirement).toBe(
                    SnapshotFieldRequirement.Required,
                );
            }
        }
    });

    it('has one rule per field with the right input kind', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        expect(rules.map((rule) => rule.field).toSorted(compareText)).toEqual(
            Object.values(SnapshotField).toSorted(compareText),
        );
        expect(ruleOf(rules, SnapshotField.AsOf).input).toBe(
            SnapshotInputKind.Date,
        );
        expect(ruleOf(rules, SnapshotField.LastPayoutOn).input).toBe(
            SnapshotInputKind.Date,
        );
        expect(ruleOf(rules, SnapshotField.PayoutsTaken).input).toBe(
            SnapshotInputKind.Count,
        );
        expect(ruleOf(rules, SnapshotField.Balance).input).toBe(
            SnapshotInputKind.Money,
        );
    });

    it('requires the intraday peak or the dashboard floor on an intraday-trailing plan', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const peak = ruleOf(rules, SnapshotField.HighestIntradayBalance);
        const floor = ruleOf(rules, SnapshotField.DashboardFloor);
        expect(peak.requirement).toBe(SnapshotFieldRequirement.OneOf);
        expect(peak.alternative).toBe(SnapshotField.DashboardFloor);
        expect(floor.requirement).toBe(SnapshotFieldRequirement.OneOf);
        expect(floor.alternative).toBe(SnapshotField.HighestIntradayBalance);
        expect(ruleOf(rules, SnapshotField.HighestEodBalance).requirement).toBe(
            SnapshotFieldRequirement.Required,
        );
    });

    it('asks no intraday peak on an EOD-trailing plan and requires the EOD peak itself (PD-15)', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Eval);
        expect(
            ruleOf(rules, SnapshotField.HighestIntradayBalance).requirement,
        ).toBe(SnapshotFieldRequirement.Hidden);
        const eodPeak = ruleOf(rules, SnapshotField.HighestEodBalance);
        expect(eodPeak.requirement).toBe(SnapshotFieldRequirement.Required);
        expect(eodPeak.alternative).toBeNull();
        const floor = ruleOf(rules, SnapshotField.DashboardFloor);
        expect(floor.requirement).toBe(SnapshotFieldRequirement.Optional);
        expect(floor.alternative).toBeNull();
    });

    it('requires the highest EOD balance on every evaluation and funded stage (PD-15)', () => {
        for (const plan of ALL_PLANS) {
            for (const stage of [AccountStage.Eval, AccountStage.Funded]) {
                const rule = ruleOf(
                    snapshotFieldRules(plan, stage),
                    SnapshotField.HighestEodBalance,
                );
                expect(rule.requirement).toBe(
                    SnapshotFieldRequirement.Required,
                );
                expect(rule.alternative).toBeNull();
            }
        }
    });

    it('follows the drawdown of the stage, not only the evaluation drawdown', () => {
        for (const plan of ALL_PLANS) {
            for (const [stage, phase] of [
                [AccountStage.Eval, TradingPhase.Eval],
                [AccountStage.Funded, TradingPhase.Funded],
            ] as const) {
                const kind = plan.drawdownFor(phase).kind;
                const peak = ruleOf(
                    snapshotFieldRules(plan, stage),
                    SnapshotField.HighestIntradayBalance,
                );
                expect(peak.requirement).toBe(
                    kind === DrawdownKind.IntradayTrailing
                        ? SnapshotFieldRequirement.OneOf
                        : SnapshotFieldRequirement.Hidden,
                );
            }
        }
    });

    const staticPlan = ALL_PLANS.find(
        (p) => evalKind(p) === DrawdownKind.Static,
    );

    it.skipIf(staticPlan === undefined)(
        'asks no intraday peak on a static drawdown but keeps the PD-15 EOD peak',
        () => {
            if (staticPlan === undefined) return;
            const rules = snapshotFieldRules(staticPlan, AccountStage.Eval);
            expect(
                ruleOf(rules, SnapshotField.HighestEodBalance).requirement,
            ).toBe(SnapshotFieldRequirement.Required);
            expect(
                ruleOf(rules, SnapshotField.HighestIntradayBalance).requirement,
            ).toBe(SnapshotFieldRequirement.Hidden);
            expect(
                ruleOf(rules, SnapshotField.DashboardFloor).requirement,
            ).toBe(SnapshotFieldRequirement.Optional);
        },
    );

    it('shows the funded-only extras on funded accounts only', () => {
        const funded = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const evaluation = snapshotFieldRules(eodPlan, AccountStage.Eval);
        const live = snapshotFieldRules(eodPlan, AccountStage.Live);
        for (const field of FUNDED_ONLY_FIELDS) {
            expect(ruleOf(funded, field).requirement).toBe(
                SnapshotFieldRequirement.Optional,
            );
            expect(ruleOf(evaluation, field).requirement).toBe(
                SnapshotFieldRequirement.Hidden,
            );
            expect(ruleOf(live, field).requirement).toBe(
                SnapshotFieldRequirement.Hidden,
            );
        }
    });

    it('labels the cumulative payout as received after the split', () => {
        const rule = ruleOf(
            snapshotFieldRules(eodPlan, AccountStage.Funded),
            SnapshotField.CumulativePayout,
        );
        expect(rule.label.toLowerCase()).toContain('received after split');
    });

    it('requires the payout count after the evaluation and hides it during it', () => {
        expect(
            ruleOf(
                snapshotFieldRules(eodPlan, AccountStage.Eval),
                SnapshotField.PayoutsTaken,
            ).requirement,
        ).toBe(SnapshotFieldRequirement.Hidden);
        for (const stage of [AccountStage.Funded, AccountStage.Live]) {
            expect(
                ruleOf(
                    snapshotFieldRules(eodPlan, stage),
                    SnapshotField.PayoutsTaken,
                ).requirement,
            ).toBe(SnapshotFieldRequirement.Required);
        }
    });

    it('offers the evaluation best day during the evaluation only', () => {
        expect(
            ruleOf(
                snapshotFieldRules(eodPlan, AccountStage.Eval),
                SnapshotField.EvalBestDayProfit,
            ).requirement,
        ).toBe(SnapshotFieldRequirement.Optional);
        expect(
            ruleOf(
                snapshotFieldRules(eodPlan, AccountStage.Funded),
                SnapshotField.EvalBestDayProfit,
            ).requirement,
        ).toBe(SnapshotFieldRequirement.Hidden);
    });

    it('asks no drawdown peak on a live account, where the live model decides the floor', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Live);
        expect(ruleOf(rules, SnapshotField.HighestEodBalance).requirement).toBe(
            SnapshotFieldRequirement.Optional,
        );
        expect(
            ruleOf(rules, SnapshotField.HighestIntradayBalance).requirement,
        ).toBe(SnapshotFieldRequirement.Optional);
        expect(ruleOf(rules, SnapshotField.DashboardFloor).requirement).toBe(
            SnapshotFieldRequirement.Optional,
        );
    });
});

describe('missingSnapshotFields', () => {
    it('lists every empty required field with its label and no alternative', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const missing = missingSnapshotFields(
            rules,
            filledOnly([SnapshotField.AsOf, SnapshotField.Balance]),
        );
        expect(missing).toEqual([
            {
                alternative: null,
                field: SnapshotField.HighestEodBalance,
                label: 'Highest end-of-day balance',
            },
            {
                alternative: null,
                field: SnapshotField.PayoutsTaken,
                label: 'Payouts taken',
            },
            {
                alternative: null,
                field: SnapshotField.TradingDays,
                label: 'Trading days',
            },
        ]);
    });

    it('lists nothing when every required field is filled and ignores hidden and optional ones', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Eval);
        expect(
            missingSnapshotFields(
                rules,
                filledOnly([
                    SnapshotField.AsOf,
                    SnapshotField.Balance,
                    SnapshotField.HighestEodBalance,
                    SnapshotField.TradingDays,
                ]),
            ),
        ).toEqual([]);
    });

    it('names both sides of an intraday one-of pair, each with the other as its alternative', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const missing = missingSnapshotFields(
            rules,
            filledOnly([
                SnapshotField.AsOf,
                SnapshotField.Balance,
                SnapshotField.HighestEodBalance,
                SnapshotField.TradingDays,
            ]),
        );
        expect(missing).toEqual([
            {
                alternative: {
                    field: SnapshotField.HighestIntradayBalance,
                    label: 'Highest intraday balance',
                },
                field: SnapshotField.DashboardFloor,
                label: 'Drawdown floor on the dashboard',
            },
            {
                alternative: {
                    field: SnapshotField.DashboardFloor,
                    label: 'Drawdown floor on the dashboard',
                },
                field: SnapshotField.HighestIntradayBalance,
                label: 'Highest intraday balance',
            },
        ]);
    });

    it('accepts either side of an intraday one-of pair', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const base = [
            SnapshotField.AsOf,
            SnapshotField.Balance,
            SnapshotField.HighestEodBalance,
            SnapshotField.TradingDays,
        ];
        for (const alternative of [
            SnapshotField.DashboardFloor,
            SnapshotField.HighestIntradayBalance,
        ]) {
            expect(
                missingSnapshotFields(
                    rules,
                    filledOnly([...base, alternative]),
                ),
            ).toEqual([]);
        }
    });
});

describe('the snapshots module', () => {
    it('is re-exported unchanged through the root barrel with no name clash', () => {
        const missing = Object.entries(snapshots)
            .filter(
                ([key, value]) =>
                    (root as Record<string, unknown>)[key] !== value,
            )
            .map(([key]) => key);
        expect(missing).toEqual([]);
        const others = new Set([
            ...Object.keys(core),
            ...Object.keys(metrics),
            ...Object.keys(alerts),
        ]);
        expect(
            Object.keys(snapshots).filter((name) => others.has(name)),
        ).toEqual([]);
    });

    it('stays server-safe: no client or server directive and only zod or ~/lib imports', () => {
        const files = ['index.ts', 'SnapshotFieldRules.ts'].map((file) =>
            readFileSync(path.join(SNAPSHOTS_DIRECTORY, file), 'utf8'),
        );
        for (const source of files) {
            expect(source).not.toMatch(/^\s*['"]use (?:client|server)['"]/m);
            const specifiers = source
                .matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gm)
                .map((match) => match[1] ?? '')
                .toArray();
            expect(specifiers.length).toBeGreaterThan(0);
            for (const specifier of specifiers) {
                expect(specifier).toMatch(/^(?:zod|~\/lib\/.+|\.\/\w+)$/);
            }
        }
    });
});
