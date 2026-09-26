import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    emptySnapshotFormValues,
    initialSnapshotRules,
    initialSnapshotStage,
    parseSnapshotForm,
    parseTagsText,
    type SnapshotDraft,
    snapshotDraftWarnings,
    type SnapshotFormResult,
    SnapshotFormResultKind,
    type SnapshotFormValues,
    validateSnapshotDraft,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import * as snapshotFieldRulesModule from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { type SnapshotPlausibilityContext } from '~/app/(app)/prop-calculator/accounts/_components/snapshotPlausibilityIssues';
import {
    AccountStage,
    compareText,
    DashboardBalanceConvention,
    EntryTextKind,
    missingSnapshotFields,
    SnapshotField,
    snapshotFieldRules,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    MAX_ACCOUNT_TAG_LENGTH,
    MAX_ACCOUNT_TAGS,
} from '~/lib/schemas/propAccounts';

const AS_OF = '2026-09-25';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

function evalKind(plan: Plan): DrawdownKind {
    return plan.drawdownFor(TradingPhase.Eval).kind;
}

function evalValues(balance: string, peak: string): SnapshotFormValues {
    return valuesWith({
        [SnapshotField.Balance]: balance,
        [SnapshotField.HighestEodBalance]: peak,
        [SnapshotField.TradingDays]: '3',
    });
}

function findPlan(isMatch: (plan: Plan) => boolean): Plan {
    const plan = ALL_PLANS.find(isMatch);
    if (plan === undefined) throw new Error('no plan matches the predicate');
    return plan;
}

function issueFields(result: SnapshotFormResult): readonly SnapshotField[] {
    return result.kind === SnapshotFormResultKind.Invalid
        ? result.issues.map((issue) => issue.field)
        : [];
}

function requiredLabels(
    rules: ReturnType<typeof initialSnapshotRules>,
): string[] {
    return missingSnapshotFields(rules, () => false).map(
        (field) => field.label,
    );
}

function valuesWith(
    entries: Partial<Record<SnapshotField, string>>,
): SnapshotFormValues {
    return { ...emptySnapshotFormValues(AS_OF), ...entries };
}

const intradayPlan = findPlan(
    (p) => evalKind(p) === DrawdownKind.IntradayTrailing,
);
const eodPlan = findPlan((p) => evalKind(p) === DrawdownKind.EodTrailing);

describe('parseSnapshotForm', () => {
    it('builds a manual snapshot in cents and nulls every hidden field', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Eval);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '51,250.25',
                [SnapshotField.CumulativePayout]: '900',
                [SnapshotField.HighestEodBalance]: '51500',
                [SnapshotField.TradingDays]: '4',
            }),
            rules,
        );
        expect(result).toEqual({
            kind: SnapshotFormResultKind.Valid,
            snapshot: {
                asOf: AS_OF,
                balanceAtLastPayoutCents: null,
                balanceCents: 5_125_025,
                cumulativePayoutCents: null,
                cycleBestDayProfitCents: null,
                dashboardFloorCents: null,
                evalBestDayProfitCents: null,
                floorAtLastPayoutCents: null,
                highestEodBalanceCents: 5_150_000,
                highestIntradayBalanceCents: null,
                lastPayoutOn: null,
                lastTradedOn: null,
                payoutsTaken: null,
                qualifyingDaysSinceLastPayout: null,
                source: SnapshotSource.Manual,
                tradingDays: 4,
            },
        });
    });

    it('reports every missing required field', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const result = parseSnapshotForm(
            valuesWith({ [SnapshotField.AsOf]: '' }),
            rules,
        );
        expect(issueFields(result)).toEqual(
            expect.arrayContaining([
                SnapshotField.AsOf,
                SnapshotField.Balance,
                SnapshotField.HighestEodBalance,
                SnapshotField.PayoutsTaken,
                SnapshotField.TradingDays,
            ]),
        );
    });

    it('rejects an EOD-trailing snapshot that gives only the dashboard floor (PD-15)', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '52000',
                [SnapshotField.DashboardFloor]: '50100',
                [SnapshotField.PayoutsTaken]: '0',
                [SnapshotField.TradingDays]: '8',
            }),
            rules,
        );
        expect(issueFields(result)).toEqual([SnapshotField.HighestEodBalance]);
    });

    it('fails an intraday-trailing snapshot with neither the peak nor the floor on both fields', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '50000',
                [SnapshotField.HighestEodBalance]: '50000',
                [SnapshotField.TradingDays]: '0',
            }),
            rules,
        );
        expect(issueFields(result).toSorted(compareText)).toEqual(
            [
                SnapshotField.DashboardFloor,
                SnapshotField.HighestIntradayBalance,
            ].toSorted(compareText),
        );
    });

    it('words a missing required field and a missing one-of pair for the form', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '50000',
                [SnapshotField.HighestEodBalance]: '50000',
            }),
            rules,
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Invalid);
        if (result.kind !== SnapshotFormResultKind.Invalid) return;
        const messages = new Map(
            result.issues.map((issue) => [issue.field, issue.message]),
        );
        expect(messages.get(SnapshotField.TradingDays)).toBe(
            'Trading days is required',
        );
        expect(messages.get(SnapshotField.DashboardFloor)).toBe(
            'Enter the drawdown floor on the dashboard or the highest intraday balance: this plan’s floor trails it',
        );
        expect(messages.get(SnapshotField.HighestIntradayBalance)).toBe(
            'Enter the highest intraday balance or the drawdown floor on the dashboard: this plan’s floor trails it',
        );
    });

    it('accepts an intraday-trailing snapshot with the EOD peak and only the dashboard floor', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '50000',
                [SnapshotField.DashboardFloor]: '48000',
                [SnapshotField.HighestEodBalance]: '50000',
                [SnapshotField.TradingDays]: '0',
            }),
            rules,
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Valid);
    });

    it('accepts an intraday-trailing snapshot with the EOD peak and only the intraday peak', () => {
        const rules = snapshotFieldRules(intradayPlan, AccountStage.Eval);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '50000',
                [SnapshotField.HighestEodBalance]: '50000',
                [SnapshotField.HighestIntradayBalance]: '50400',
                [SnapshotField.TradingDays]: '1',
            }),
            rules,
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Valid);
    });

    it('reports unreadable money and counts on their own fields', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '50k',
                [SnapshotField.HighestEodBalance]: '51000',
                [SnapshotField.PayoutsTaken]: '1.5',
                [SnapshotField.QualifyingDaysSinceLastPayout]: '-1',
                [SnapshotField.TradingDays]: 'ten',
            }),
            rules,
        );
        expect(issueFields(result).toSorted(compareText)).toEqual(
            [
                SnapshotField.Balance,
                SnapshotField.PayoutsTaken,
                SnapshotField.QualifyingDaysSinceLastPayout,
                SnapshotField.TradingDays,
            ].toSorted(compareText),
        );
    });

    it('maps schema errors back to the field that caused them', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.AsOf]: '2026-02-30',
                [SnapshotField.Balance]: '50000',
                [SnapshotField.CumulativePayout]: '-5',
                [SnapshotField.HighestEodBalance]: '51000',
                [SnapshotField.PayoutsTaken]: '0',
                [SnapshotField.TradingDays]: '3',
            }),
            rules,
        );
        expect(issueFields(result).toSorted(compareText)).toEqual(
            [SnapshotField.AsOf, SnapshotField.CumulativePayout].toSorted(
                compareText,
            ),
        );
    });

    it('keeps the funded extras on a funded snapshot', () => {
        const rules = snapshotFieldRules(eodPlan, AccountStage.Funded);
        const result = parseSnapshotForm(
            valuesWith({
                [SnapshotField.Balance]: '52000',
                [SnapshotField.CumulativePayout]: '1800',
                [SnapshotField.HighestEodBalance]: '53000',
                [SnapshotField.LastPayoutOn]: '2026-09-10',
                [SnapshotField.PayoutsTaken]: '2',
                [SnapshotField.QualifyingDaysSinceLastPayout]: '3',
                [SnapshotField.TradingDays]: '20',
            }),
            rules,
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Valid);
        if (result.kind !== SnapshotFormResultKind.Valid) return;
        expect(result.snapshot.cumulativePayoutCents).toBe(180_000);
        expect(result.snapshot.lastPayoutOn).toBe('2026-09-10');
        expect(result.snapshot.payoutsTaken).toBe(2);
        expect(result.snapshot.qualifyingDaysSinceLastPayout).toBe(3);
    });

    it('starts every field empty except the date', () => {
        const values = emptySnapshotFormValues(AS_OF);
        for (const field of Object.values(SnapshotField)) {
            expect(values[field]).toBe(
                field === SnapshotField.AsOf ? AS_OF : '',
            );
        }
    });
});

describe('initialSnapshotRules', () => {
    const plan = findPlan(
        (p) => !p.isInstantFunded && evalKind(p) === DrawdownKind.EodTrailing,
    );
    const instantPlan = findPlan((p) => p.isInstantFunded);
    const funded = {
        fundedOn: '2026-09-10',
        purchasedOn: '2026-09-01',
        stage: AccountStage.Funded,
    };

    it('checks a snapshot dated before the funded date against the eval rules, as the CSV import does', () => {
        const rules = initialSnapshotRules(plan, funded, '2026-09-05');
        expect(rules).toEqual(snapshotFieldRules(plan, AccountStage.Eval));
        expect(requiredLabels(rules)).not.toContain('Payouts taken');
    });

    it('checks a snapshot from the funded date on against the funded rules', () => {
        for (const asOf of ['2026-09-10', '2026-09-25']) {
            const rules = initialSnapshotRules(plan, funded, asOf);
            expect(rules).toEqual(
                snapshotFieldRules(plan, AccountStage.Funded),
            );
            expect(requiredLabels(rules)).toContain('Payouts taken');
        }
    });

    it('checks a live account with no funded date against the live rules from its purchase on', () => {
        const live = { ...funded, fundedOn: '', stage: AccountStage.Live };
        expect(initialSnapshotRules(plan, live, '2026-09-01')).toEqual(
            snapshotFieldRules(plan, AccountStage.Live),
        );
    });

    it('never checks an instant-funded account against eval rules', () => {
        expect(initialSnapshotRules(instantPlan, funded, '2026-09-05')).toEqual(
            snapshotFieldRules(instantPlan, AccountStage.Funded),
        );
    });

    it('keeps the stage picked in the form while a date is not a valid date yet', () => {
        for (const draft of [
            { asOf: '', fundedOn: funded.fundedOn, purchasedOn: '2026-09-01' },
            {
                asOf: '2026-09-0',
                fundedOn: funded.fundedOn,
                purchasedOn: '2026-09-01',
            },
            { asOf: '2026-09-05', fundedOn: funded.fundedOn, purchasedOn: '' },
        ]) {
            expect(
                initialSnapshotRules(
                    plan,
                    {
                        ...funded,
                        fundedOn: draft.fundedOn,
                        purchasedOn: draft.purchasedOn,
                    },
                    draft.asOf,
                ),
            ).toEqual(snapshotFieldRules(plan, AccountStage.Funded));
        }
    });

    it('ignores a funded date that is not a valid date yet', () => {
        expect(
            initialSnapshotRules(
                plan,
                { ...funded, fundedOn: '2026-09' },
                '2026-09-05',
            ),
        ).toEqual(snapshotFieldRules(plan, AccountStage.Funded));
    });
});

describe('initialSnapshotStage', () => {
    const plan = findPlan(
        (p) => !p.isInstantFunded && evalKind(p) === DrawdownKind.EodTrailing,
    );
    const funded = {
        fundedOn: '2026-09-10',
        purchasedOn: '2026-09-01',
        stage: AccountStage.Funded,
    };

    it('gives the stage the initial snapshot rules are built for', () => {
        expect(initialSnapshotStage(plan, funded, '2026-09-05')).toBe(
            AccountStage.Eval,
        );
        expect(initialSnapshotStage(plan, funded, '2026-09-10')).toBe(
            AccountStage.Funded,
        );
        expect(initialSnapshotStage(plan, funded, '2026-09-0')).toBe(
            AccountStage.Funded,
        );
        for (const asOf of ['2026-09-05', '2026-09-10', '']) {
            expect(initialSnapshotRules(plan, funded, asOf)).toEqual(
                snapshotFieldRules(
                    plan,
                    initialSnapshotStage(plan, funded, asOf),
                ),
            );
        }
    });
});

describe('validateSnapshotDraft', () => {
    const fiftyK = findPlan(
        (p) =>
            p.accountSize === 50_000 &&
            !p.isInstantFunded &&
            evalKind(p) === DrawdownKind.EodTrailing,
    );
    const rules = snapshotFieldRules(fiftyK, AccountStage.Eval);

    function contextFor(
        dashboardConvention: DashboardBalanceConvention,
    ): SnapshotPlausibilityContext {
        return {
            account: {
                accountSize: 50_000,
                dashboardConvention,
                liveStartBalanceCents: null,
            },
            plan: fiftyK,
            stage: AccountStage.Eval,
        };
    }

    it('blocks a nominal 2,400 on a 50K account with the convention message on the balance', () => {
        const values = evalValues('2,400', '2,400');
        expect(parseSnapshotForm(values, rules).kind).toBe(
            SnapshotFormResultKind.Valid,
        );
        const result = validateSnapshotDraft(
            values,
            rules,
            contextFor(DashboardBalanceConvention.Nominal),
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Invalid);
        if (result.kind !== SnapshotFormResultKind.Invalid) return;
        const balance = result.issues.find(
            (issue) => issue.field === SnapshotField.Balance,
        );
        expect(balance?.message).toContain(
            'set the dashboard convention to $0-based',
        );
        expect(result.formIssues).toEqual([]);
    });

    it('blocks a $0-based 52,400 on a 50K account with the convention message on the balance', () => {
        const result = validateSnapshotDraft(
            evalValues('52400', '52400'),
            rules,
            contextFor(DashboardBalanceConvention.ZeroBased),
        );
        expect(result.kind).toBe(SnapshotFormResultKind.Invalid);
        if (result.kind !== SnapshotFormResultKind.Invalid) return;
        expect(
            result.issues.find((issue) => issue.field === SnapshotField.Balance)
                ?.message,
        ).toContain('set the dashboard convention to nominal');
    });

    it('accepts the same 2,400 once the account is $0-based', () => {
        const values = evalValues('2,400', '2,400');
        expect(
            validateSnapshotDraft(
                values,
                rules,
                contextFor(DashboardBalanceConvention.ZeroBased),
            ),
        ).toEqual(parseSnapshotForm(values, rules));
    });

    it('accepts a balance far above the account size and returns it only as a warning on the balance', () => {
        const ceiling =
            50_000 +
            fiftyK.profitTarget +
            fiftyK.drawdownFor(TradingPhase.Eval).amount;
        const values = evalValues(String(ceiling + 200), String(ceiling + 200));
        const context = contextFor(DashboardBalanceConvention.Nominal);
        expect(validateSnapshotDraft(values, rules, context)).toEqual(
            parseSnapshotForm(values, rules),
        );
        const warnings = snapshotDraftWarnings(values, rules, context);
        expect(warnings.fieldWarnings.map((warning) => warning.field)).toEqual([
            SnapshotField.Balance,
            SnapshotField.HighestEodBalance,
        ]);
        expect(warnings.formWarnings).toEqual([]);
    });

    it('gives no warning until the snapshot reads', () => {
        expect(
            snapshotDraftWarnings(
                evalValues('99,000', 'lots'),
                rules,
                contextFor(DashboardBalanceConvention.Nominal),
            ),
        ).toEqual({ fieldWarnings: [], formWarnings: [] });
    });

    it('keeps the parse and schema issues when a field does not read', () => {
        const values = valuesWith({
            [SnapshotField.Balance]: '2,400',
            [SnapshotField.HighestEodBalance]: '2,400',
            [SnapshotField.TradingDays]: 'ten',
        });
        const result = validateSnapshotDraft(
            values,
            rules,
            contextFor(DashboardBalanceConvention.Nominal),
        );
        expect(issueFields(result)).toEqual([SnapshotField.TradingDays]);
    });
});

describe('SnapshotField', () => {
    it('names exactly the fields of the snapshot draft', () => {
        expectTypeOf<`${SnapshotField}`>().toEqualTypeOf<
            Exclude<keyof SnapshotDraft, 'source'>
        >();
        expect(
            Object.keys(emptySnapshotFormValues(AS_OF)).toSorted(compareText),
        ).toEqual(Object.values(SnapshotField).toSorted(compareText));
    });
});

describe('parseTagsText', () => {
    it('reads an empty entry as no tags', () => {
        expect(parseTagsText('')).toEqual({
            kind: EntryTextKind.Valid,
            tags: [],
        });
        expect(parseTagsText(' , ,')).toEqual({
            kind: EntryTextKind.Valid,
            tags: [],
        });
    });

    it('splits on commas, trims and drops duplicates', () => {
        expect(parseTagsText(' core, nq ,core,,es ')).toEqual({
            kind: EntryTextKind.Valid,
            tags: ['core', 'nq', 'es'],
        });
    });

    it('rejects a tag that is too long and names it', () => {
        const long = 'x'.repeat(MAX_ACCOUNT_TAG_LENGTH + 1);
        const result = parseTagsText(`core, ${long}`);
        expect(result.kind).toBe(EntryTextKind.Invalid);
        if (result.kind !== EntryTextKind.Invalid) return;
        expect(result.message).toContain(long);
    });

    it('accepts a tag at the length limit', () => {
        const atLimit = 'x'.repeat(MAX_ACCOUNT_TAG_LENGTH);
        expect(parseTagsText(atLimit)).toEqual({
            kind: EntryTextKind.Valid,
            tags: [atLimit],
        });
    });

    it('rejects more tags than an account can hold', () => {
        const text = Array.from(
            { length: MAX_ACCOUNT_TAGS + 1 },
            (_, index) => `t${index}`,
        ).join(',');
        const result = parseTagsText(text);
        expect(result.kind).toBe(EntryTextKind.Invalid);
        if (result.kind !== EntryTextKind.Invalid) return;
        expect(result.message).toContain(String(MAX_ACCOUNT_TAGS));
    });
});

describe('the entry-text parsers', () => {
    it('are imported from ~/lib/prop-accounts only, never re-exported by the snapshot field rules', () => {
        const exported = Object.keys(snapshotFieldRulesModule);
        for (const name of [
            'EntryTextKind',
            'parseCountText',
            'parseMoneyText',
        ]) {
            expect(exported).not.toContain(name);
        }
    });
});
