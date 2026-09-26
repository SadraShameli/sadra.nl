import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    emptySnapshotFormValues,
    EntryTextKind,
    parseCountText,
    parseMoneyText,
    parseSnapshotForm,
    parseTagsText,
    type SnapshotDraft,
    type SnapshotFormResult,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import {
    AccountStage,
    compareText,
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

function valuesWith(
    entries: Partial<Record<SnapshotField, string>>,
): SnapshotFormValues {
    return { ...emptySnapshotFormValues(AS_OF), ...entries };
}

const intradayPlan = findPlan(
    (p) => evalKind(p) === DrawdownKind.IntradayTrailing,
);
const eodPlan = findPlan((p) => evalKind(p) === DrawdownKind.EodTrailing);

describe('parseMoneyText', () => {
    it('reads an empty entry as empty', () => {
        expect(parseMoneyText('')).toEqual({ kind: EntryTextKind.Empty });
        expect(parseMoneyText(' '.repeat(3))).toEqual({
            kind: EntryTextKind.Empty,
        });
    });

    it('reads dollars and cents exactly', () => {
        expect(parseMoneyText('52100.5')).toEqual({
            cents: 5_210_050,
            kind: EntryTextKind.Valid,
        });
        expect(parseMoneyText('0.01')).toEqual({
            cents: 1,
            kind: EntryTextKind.Valid,
        });
    });

    it('accepts a dollar sign and thousands separators', () => {
        expect(parseMoneyText('$52,100.50')).toEqual({
            cents: 5_210_050,
            kind: EntryTextKind.Valid,
        });
    });

    it('accepts a negative balance for a $0-based dashboard', () => {
        expect(parseMoneyText('-1,250')).toEqual({
            cents: -125_000,
            kind: EntryTextKind.Valid,
        });
    });

    it('rejects text, sub-cent amounts and misplaced separators', () => {
        for (const text of ['abc', '12.345', '1,2,3', '1e5', '5.']) {
            expect(parseMoneyText(text).kind).toBe(EntryTextKind.Invalid);
        }
    });
});

describe('parseCountText', () => {
    it('reads an empty entry as empty', () => {
        expect(parseCountText('')).toEqual({ kind: EntryTextKind.Empty });
        expect(parseCountText(' ')).toEqual({ kind: EntryTextKind.Empty });
    });

    it('reads a whole number of 0 or more', () => {
        expect(parseCountText('0')).toEqual({
            count: 0,
            kind: EntryTextKind.Valid,
        });
        expect(parseCountText(' 12 ')).toEqual({
            count: 12,
            kind: EntryTextKind.Valid,
        });
    });

    it('rejects fractions, negatives and text', () => {
        for (const text of ['1.5', '-1', 'ten', '1e3']) {
            expect(parseCountText(text).kind).toBe(EntryTextKind.Invalid);
        }
    });
});

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
