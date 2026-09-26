import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountStage, impliedEvalPassOn } from '~/lib/prop-accounts/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const IMPLIED_PASS_ROOTS = [
    'src/lib/prop-accounts',
    'src/server/api/routers/propAccounts',
];
const IMPLIED_PASS_HOME = 'src/lib/prop-accounts/core/AccountEventKind.ts';
const IMPLIED_PASS_COPY_PATTERNS = [
    /fundedOn\s*(\?\?|\|\|)\s*[\w.]*purchasedOn/,
    /fundedOn\s*[!=]==?\s*null/,
    /null\s*[!=]==?\s*[\w.]*fundedOn/,
];

function impliedPassCopiesIn(text: string): string[] {
    return IMPLIED_PASS_COPY_PATTERNS.filter((pattern) =>
        pattern.test(text),
    ).map(String);
}

function scannedFiles(): string[] {
    return IMPLIED_PASS_ROOTS.flatMap((root) =>
        readdirSync(path.join(REPO_ROOT, root), { recursive: true })
            .map(String)
            .filter((name) => name.endsWith('.ts'))
            .map((name) =>
                path.posix.join(root, name.split(path.sep).join('/')),
            ),
    ).filter((file) => file !== IMPLIED_PASS_HOME);
}

const EVAL_FACTS = { isInstantFunded: false };
const INSTANT_FACTS = { isInstantFunded: true };
const PURCHASED_ON = '2026-09-01';

interface ImpliedPassCase {
    readonly expected: ReturnType<typeof impliedEvalPassOn>;
    readonly facts: { readonly isInstantFunded: boolean };
    readonly fundedOn: null | string;
    readonly hasRecordedPass: boolean;
    readonly name: string;
    readonly stage: AccountStage;
}

const CASES: readonly ImpliedPassCase[] = [
    {
        expected: { dateKnown: true, on: '2026-09-15' },
        facts: EVAL_FACTS,
        fundedOn: '2026-09-15',
        hasRecordedPass: false,
        name: 'a Funded row with a funded date passes on that date',
        stage: AccountStage.Funded,
    },
    {
        expected: { dateKnown: true, on: '2026-09-15' },
        facts: EVAL_FACTS,
        fundedOn: '2026-09-15',
        hasRecordedPass: false,
        name: 'a Live row with a funded date passes on that date',
        stage: AccountStage.Live,
    },
    {
        expected: { dateKnown: false, on: PURCHASED_ON },
        facts: EVAL_FACTS,
        fundedOn: null,
        hasRecordedPass: false,
        name: 'a Funded row with no funded date passes on its purchase date, marked unknown',
        stage: AccountStage.Funded,
    },
    {
        expected: { dateKnown: false, on: PURCHASED_ON },
        facts: EVAL_FACTS,
        fundedOn: null,
        hasRecordedPass: false,
        name: 'a Live row with no funded date passes on its purchase date, marked unknown',
        stage: AccountStage.Live,
    },
    {
        expected: null,
        facts: EVAL_FACTS,
        fundedOn: '2026-09-15',
        hasRecordedPass: true,
        name: 'a recorded pass needs no implied one',
        stage: AccountStage.Funded,
    },
    {
        expected: null,
        facts: EVAL_FACTS,
        fundedOn: '2026-09-15',
        hasRecordedPass: false,
        name: 'an account still in its evaluation has not passed',
        stage: AccountStage.Eval,
    },
    {
        expected: null,
        facts: INSTANT_FACTS,
        fundedOn: null,
        hasRecordedPass: false,
        name: 'an instant-funded plan has no evaluation to pass',
        stage: AccountStage.Funded,
    },
];

describe('impliedEvalPassOn', () => {
    it.each(CASES)(
        '$name',
        ({ expected, facts, fundedOn, hasRecordedPass, stage }) => {
            expect(
                impliedEvalPassOn(
                    { fundedOn, purchasedOn: PURCHASED_ON, stage },
                    facts,
                    hasRecordedPass,
                ),
            ).toEqual(expected);
        },
    );

    it('is the one place that falls back to the purchase date or checks for a funded date', () => {
        const copies = scannedFiles().flatMap((file) =>
            impliedPassCopiesIn(
                readFileSync(path.join(REPO_ROOT, file), 'utf8'),
            ).map((pattern) => `${file}: ${pattern}`),
        );
        expect(copies).toEqual([]);
    });

    it.each([
        ['a single-line fallback', 'row.fundedOn ?? row.purchasedOn'],
        [
            'a fallback wrapped by Prettier',
            'row.fundedOn ??\n        row.purchasedOn',
        ],
        ['an or fallback', 'row.fundedOn || row.purchasedOn'],
        ['a strict funded-date check', 'row.fundedOn !== null'],
        ['a strict missing-date check', 'row.fundedOn === null ? a : b'],
        ['a loose funded-date check', 'row.fundedOn != null'],
        ['a loose missing-date check', 'row.fundedOn == null'],
        ['a reversed funded-date check', 'null !== row.fundedOn'],
    ])('flags %s as a copy of the rule', (_name, source) => {
        expect(impliedPassCopiesIn(source)).not.toEqual([]);
    });

    it('leaves a plain read of the funded date alone', () => {
        expect(
            impliedPassCopiesIn(
                "fundedOn: input.fundedOn,\nPick<OwnedAccount, 'fundedOn' | 'purchasedOn'>",
            ),
        ).toEqual([]);
    });

    it('scans every prop-accounts module and router except the helper itself', () => {
        const files = scannedFiles();
        expect(files).toEqual(
            expect.arrayContaining([
                'src/lib/prop-accounts/metrics/CostAnalytics.ts',
                'src/lib/prop-accounts/metrics/PortfolioLedger.ts',
                'src/lib/prop-accounts/metrics/ReplacementStats.ts',
                'src/server/api/routers/propAccounts/account.ts',
                'src/server/api/routers/propAccounts/event.ts',
                'src/server/api/routers/propAccounts/mutationGuard.ts',
            ]),
        );
        expect(files).not.toContain(IMPLIED_PASS_HOME);
    });
});
