import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    attemptEconomicsOfRun,
    filledEvFormulaText,
    paidFundedPayoutStatsOf,
    type RunAttemptEconomics,
    type RunAttemptOutputs,
} from '~/lib/prop-calculator/economics';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const SIM_COMMAND = 'src/cli/commands/prop/sim/command.ts';
const WEB_MODEL =
    'src/app/(app)/prop-calculator/_components/economics/attemptEconomicsModel.ts';
const HELPER = 'src/lib/prop-calculator/economics/AttemptEconomicsFormula.ts';

function economicsOf(liveTransferCash: number): RunAttemptEconomics {
    const outputs: RunAttemptOutputs = {
        attemptPassProbability: 0.4,
        copyAccounts: 1,
        costPerAttempt: 140,
        estimates: {
            attemptPassProbability: { standardError: 0.025, value: 0.4 },
            costPerAttempt: { standardError: 5, value: 140 },
            expectedNetPerAttempt: { standardError: 10, value: 220 },
        },
        expectedAttempts: 2,
        expectedLiveTransferCash: liveTransferCash,
        expectedNetPerAttempt: 220,
        expectedPayoutPerFundedAccount: 900,
    };
    const { reason, value } = attemptEconomicsOfRun(outputs, 63);
    if (value === null) throw new Error(`no economics: ${reason}`);
    return value;
}

function occurrences(text: string, pattern: RegExp): number {
    return (text.match(new RegExp(pattern, 'g')) ?? []).length;
}

function textOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('filledEvFormulaText (F-V9, PT-94b)', () => {
    it('fills the pass, funded value and attempt cost terms and ends on the caller result text', () => {
        expect(filledEvFormulaText(economicsOf(0), '$220 (SE $10)')).toBe(
            'pass 40.0% × funded value $900 − attempt cost $140 = $220 (SE $10)',
        );
    });

    it('adds the live transfer cash per attempt term only when it is not zero', () => {
        expect(filledEvFormulaText(economicsOf(60), '$250')).toBe(
            'pass 40.0% × funded value $900 + live transfer cash per attempt $30 − attempt cost $140 = $250',
        );
    });
});

describe('paidFundedPayoutStatsOf (F-V9, PT-94b)', () => {
    it('divides payouts per funded account by the any-payout probability and the payout value by the payouts', () => {
        expect(
            paidFundedPayoutStatsOf({
                anyPayoutGivenFundedProbability: 0.6,
                expectedPayoutPerFundedAccount: 900,
                payoutsPerFundedAccount: 1.2,
            }),
        ).toStrictEqual({ averagePayout: 750, payoutsPerPaidFunded: 2 });
    });

    it('is null on a zero denominator', () => {
        expect(
            paidFundedPayoutStatsOf({
                anyPayoutGivenFundedProbability: 0,
                expectedPayoutPerFundedAccount: 0,
                payoutsPerFundedAccount: 0,
            }),
        ).toStrictEqual({ averagePayout: null, payoutsPerPaidFunded: null });
    });
});

describe('one EV formula builder for the CLI and the web (F-V9, PT-94b)', () => {
    it('builds the filled formula in exactly one place, the economics helper', () => {
        expect(occurrences(textOf(HELPER), /× funded value/)).toBe(1);
        expect(occurrences(textOf(SIM_COMMAND), /× funded value/)).toBe(0);
        expect(occurrences(textOf(WEB_MODEL), /× funded value/)).toBe(0);
        expect(
            occurrences(textOf(HELPER), /function filledEvFormulaText/),
        ).toBe(1);
        expect(
            occurrences(
                textOf(SIM_COMMAND),
                /function (?:filledFormulaText|formulaTextOf)/,
            ),
        ).toBe(0);
        expect(
            occurrences(
                textOf(WEB_MODEL),
                /function (?:filledFormulaText|formulaTextOf)/,
            ),
        ).toBe(0);
    });

    it('keeps one ratio helper instead of a ratioOf per consumer', () => {
        expect(occurrences(textOf(HELPER), /function ratioOf/)).toBe(1);
        expect(occurrences(textOf(SIM_COMMAND), /function ratioOf/)).toBe(0);
        expect(occurrences(textOf(WEB_MODEL), /function ratioOf/)).toBe(0);
    });

    it('imports the helper from the economics barrel in both consumers', () => {
        for (const consumer of [SIM_COMMAND, WEB_MODEL]) {
            expect(textOf(consumer)).toMatch(
                /import\s*{[^}]*filledEvFormulaText[^}]*}\s*from\s*'~\/lib\/prop-calculator\/economics'/,
            );
        }
    });
});
