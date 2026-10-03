import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { type z } from 'zod';

import {
    type AccountEventDetail,
    accountEventDetailSchema,
    type PersonalRules,
    personalRulesSchema,
    readAccountEventDetail,
    readAccountTags,
    readAccountTagsOrNull,
    readPersonalRules,
    readPersonalRulesOrNull,
    readPlanOptIns,
    readPlanOptInsOrNull,
    readRulebookParameters,
} from '~/lib/prop-accounts';
import { DayStopRuleKind, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
} from '~/lib/prop-calculator/advisor';

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('readPlanOptIns', () => {
    it('defaults missing keys to false', () => {
        expect(readPlanOptIns({})).toEqual(NO_PLAN_OPT_INS);
        expect(readPlanOptIns({ takesFundedReset: true })).toEqual({
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: false,
        });
    });

    it('drops unknown keys', () => {
        expect(
            readPlanOptIns({
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: true,
                takesSomethingNew: true,
            }),
        ).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: true,
        });
    });

    it('fails loud on a corrupt value instead of guessing', () => {
        expect(() => readPlanOptIns({ takesFundedReset: 'yes' })).toThrow();
        expect(() => readPlanOptIns('[]')).toThrow();
        expect(() => readPlanOptIns(null)).toThrow();
    });
});

describe('readPersonalRules', () => {
    it('reads an empty object as no personal rules', () => {
        expect(readPersonalRules({})).toEqual({});
    });

    it('keeps known caps and drops unknown keys', () => {
        expect(
            readPersonalRules({
                dailyLossLimitCents: 60_000,
                legacyFlag: true,
                payoutRequestOverrideCents: 100_000,
            }),
        ).toEqual({
            dailyLossLimitCents: 60_000,
            payoutRequestOverrideCents: 100_000,
        });
    });

    it('fails loud on a non-positive cap', () => {
        expect(() => readPersonalRules({ maxRiskPerTradeCents: 0 })).toThrow();
    });
});

describe('readAccountTags', () => {
    it('reads a missing or null value as no tags', () => {
        expect(readAccountTags(null)).toEqual([]);
        expect(readAccountTags(undefined)).toEqual([]);
    });

    it('reads a list of strings as it is stored', () => {
        expect(readAccountTags([])).toEqual([]);
        expect(readAccountTags(['mff', 'swing'])).toEqual(['mff', 'swing']);
    });

    it('fails loud on a value that is not a list of strings instead of guessing', () => {
        expect(() => readAccountTags({ mff: true })).toThrow();
        expect(() => readAccountTags('mff')).toThrow();
        expect(() => readAccountTags(42)).toThrow();
        expect(() => readAccountTags(['mff', 1])).toThrow();
    });
});

describe('readRulebookParameters', () => {
    it('reads an empty object as the defaults', () => {
        expect(readRulebookParameters({})).toEqual(DEFAULT_RULEBOOK);
    });

    it('reads a rulebook without schemaVersion as version 1', () => {
        const withoutVersion = Object.fromEntries(
            Object.entries(structuredClone(DEFAULT_RULEBOOK)).filter(
                ([key]) => key !== 'schemaVersion',
            ),
        );
        expect('schemaVersion' in withoutVersion).toBe(false);
        expect(readRulebookParameters(withoutVersion).schemaVersion).toBe(1);
    });

    it('fills missing nested keys from the defaults and keeps stored values', () => {
        const stored = {
            eval: { mode: EvalSizingMode.MaxRisk },
            funded: { riskCents: 20_000 },
        };
        const read = readRulebookParameters(stored);
        expect(read.eval).toEqual({
            ...DEFAULT_RULEBOOK.eval,
            mode: EvalSizingMode.MaxRisk,
        });
        expect(read.funded).toEqual({
            ...DEFAULT_RULEBOOK.funded,
            riskCents: 20_000,
        });
        expect(read.payout).toEqual(DEFAULT_RULEBOOK.payout);
    });

    it('fills missing keys inside nested groups from the defaults', () => {
        const read = readRulebookParameters({
            eval: { generalDerivation: { firstRungFraction: 0.3 } },
            live: { cushionPercent: { preLock: 0.04 } },
        });
        expect(read.eval.generalDerivation).toEqual({
            escalation: DEFAULT_RULEBOOK.eval.generalDerivation.escalation,
            firstRungFraction: 0.3,
        });
        expect(read.live.cushionPercent).toEqual({
            postLock: DEFAULT_RULEBOOK.live.cushionPercent.postLock,
            preLock: 0.04,
        });
        expect(read.eval.mode).toBe(DEFAULT_RULEBOOK.eval.mode);
    });

    it('reads a stored stop rule whole and never merges it into the default kind', () => {
        expect(
            readRulebookParameters({
                funded: {
                    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
                },
            }).funded.stopRule,
        ).toEqual({ k: 2, kind: DayStopRuleKind.AfterKLosses });
        expect(() =>
            readRulebookParameters({ funded: { stopRule: { k: 2 } } }),
        ).toThrow();
    });

    it('fails loud when a stored group is not an object', () => {
        expect(() => readRulebookParameters({ eval: 'ladder' })).toThrow();
        expect(() =>
            readRulebookParameters({ eval: { generalDerivation: [0.2] } }),
        ).toThrow();
    });

    it('drops unknown keys at every level', () => {
        const read = readRulebookParameters({
            eval: { legacyEvalRiskCents: 90_000 },
            retired: true,
        });
        expect(read).not.toHaveProperty('retired');
        expect(read.eval).not.toHaveProperty('legacyEvalRiskCents');
        expect(read).toEqual(DEFAULT_RULEBOOK);
    });

    it('replaces arrays wholesale instead of merging them', () => {
        expect(
            readRulebookParameters({
                eval: { mffSearchFractions: [0.5, 0.5] },
            }).eval.mffSearchFractions,
        ).toEqual([0.5, 0.5]);
    });

    it('still enforces the rulebook rules on stored values', () => {
        expect(() =>
            readRulebookParameters({ payout: { retainedCushionCents: 100 } }),
        ).toThrow();
        expect(() => readRulebookParameters({ schemaVersion: 2 })).toThrow();
    });

    it('does not mutate the defaults or the stored value', () => {
        const stored = { eval: { mode: EvalSizingMode.MaxRisk } };
        const before = structuredClone(DEFAULT_RULEBOOK);
        readRulebookParameters(stored);
        expect(DEFAULT_RULEBOOK).toEqual(before);
        expect(stored).toEqual({ eval: { mode: EvalSizingMode.MaxRisk } });
    });
});

describe('readAccountEventDetail', () => {
    it('reads an empty object as no note and no changes', () => {
        expect(readAccountEventDetail({})).toEqual({ changes: [], note: null });
    });

    it('keeps a field diff and drops unknown keys', () => {
        expect(
            readAccountEventDetail({
                changes: [{ field: 'label', from: 'A', to: 'B', why: 'x' }],
                source: 'old',
            }),
        ).toEqual({
            changes: [{ field: 'label', from: 'A', to: 'B' }],
            note: null,
        });
    });

    it('fails loud on an unbounded detail', () => {
        expect(() =>
            readAccountEventDetail({ note: 'x'.repeat(10_000) }),
        ).toThrow();
    });
});

describe('jsonb schema typing', () => {
    it('keeps the object shape of each jsonb schema visible', () => {
        expect(Object.keys(personalRulesSchema.shape).toSorted(byName)).toEqual(
            [
                'dailyLossLimitCents',
                'dailyProfitCapCents',
                'maxRiskPerTradeCents',
                'maxTradesPerDay',
                'payoutRequestOverrideCents',
                'retainedCushionCents',
            ],
        );
        expect(
            Object.keys(accountEventDetailSchema.shape).toSorted(byName),
        ).toEqual(['bustCause', 'changes', 'note']);
        expectTypeOf<
            z.output<typeof personalRulesSchema>
        >().toExtend<PersonalRules>();
        expectTypeOf<
            z.output<typeof accountEventDetailSchema>
        >().toExtend<AccountEventDetail>();
    });
});

describe('the null-returning readers', () => {
    it('read what the throwing readers read', () => {
        expect(readPlanOptInsOrNull({ takesFundedReset: true })).toEqual(
            readPlanOptIns({ takesFundedReset: true }),
        );
        expect(
            readPersonalRulesOrNull({ maxTradesPerDay: 3, unknownCap: 1 }),
        ).toEqual(readPersonalRules({ maxTradesPerDay: 3, unknownCap: 1 }));
    });

    it('readAccountTagsOrNull reads what readAccountTags reads and returns null on a corrupt value', () => {
        expect(readAccountTagsOrNull(['mff'])).toEqual(
            readAccountTags(['mff']),
        );
        expect(readAccountTagsOrNull(null)).toEqual([]);
        for (const raw of [{ mff: true }, 'mff', 42, ['mff', 1]]) {
            expect(readAccountTagsOrNull(raw)).toBeNull();
        }
    });

    it('return null on a corrupt value instead of throwing or guessing', () => {
        for (const raw of [{ takesFundedReset: 'yes' }, '[]', null, 42]) {
            expect(readPlanOptInsOrNull(raw)).toBeNull();
        }
        for (const raw of [
            { maxRiskPerTradeCents: 'lots' },
            { maxTradesPerDay: -1 },
            null,
            [],
        ]) {
            expect(readPersonalRulesOrNull(raw)).toBeNull();
        }
    });
});

describe('the account tag readers follow the barrel rule (PT-110b)', () => {
    const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
    const CORE_DIR = 'src/lib/prop-accounts/core';
    const READERS_MODULE = 'JsonbReaders';
    const DEEP_IMPORT = `'~/lib/prop-accounts/core/${READERS_MODULE}'`;

    async function deepImportersUnder(directory: string): Promise<string[]> {
        const entries = await readdir(path.join(REPO_ROOT, directory), {
            recursive: true,
            withFileTypes: true,
        });
        const files = entries
            .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
            .map((entry) =>
                path
                    .relative(REPO_ROOT, path.join(entry.parentPath, entry.name))
                    .replaceAll('\\', '/'),
            )
            .filter((file) => !file.startsWith(`${CORE_DIR}/`));
        const importers = await Promise.all(
            files.map(async (file) => {
                const text = await readFile(path.join(REPO_ROOT, file), 'utf8');
                return text.includes(DEEP_IMPORT) ? file : null;
            }),
        );
        return importers.filter((file) => file !== null);
    }

    it('has no importer outside the core folder reaching into JsonbReaders.ts', async () => {
        const found = await Promise.all([
            deepImportersUnder('src'),
            deepImportersUnder('tests/unit/lib/prop-accounts'),
        ]);
        const deepImporters = found.flat();

        expect(deepImporters).toStrictEqual([]);
    });
});
