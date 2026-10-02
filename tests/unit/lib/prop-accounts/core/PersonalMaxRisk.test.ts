import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { personalMaxRiskOf, usdCents } from '~/lib/prop-accounts/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const SCANNED_ROOT = 'src';
const MAX_RISK_READERS = [
    'src/app/(app)/prop-calculator/accounts/_components/accountPlanOptions.ts',
    'src/lib/prop-accounts/core/PersonalRules.ts',
];

function filesReadingMaxRisk(): string[] {
    return readdirSync(path.join(REPO_ROOT, SCANNED_ROOT), { recursive: true })
        .map(String)
        .filter((name) => /\.tsx?$/u.test(name))
        .map((name) =>
            path.posix.join(SCANNED_ROOT, name.split(path.sep).join('/')),
        )
        .filter((file) =>
            /\.maxRiskPerTradeCents\b/u.test(
                readFileSync(path.join(REPO_ROOT, file), 'utf8'),
            ),
        )
        .toSorted((a, b) => a.localeCompare(b));
}

describe('personalMaxRiskOf (PT-68g, F-V16)', () => {
    it('turns the personal max risk per trade into dollars, and none when the rules or the entry are missing', () => {
        expect(
            personalMaxRiskOf({ maxRiskPerTradeCents: usdCents(12_500) }),
        ).toBe(125);
        expect(personalMaxRiskOf({ maxTradesPerDay: 2 })).toBeNull();
        expect(personalMaxRiskOf(null)).toBeNull();
    });

    it('is the one conversion of the max risk entry to dollars; only the account form also reads the entry, as text', () => {
        expect(filesReadingMaxRisk()).toEqual(MAX_RISK_READERS);
    });
});
