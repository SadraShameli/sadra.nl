import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    adviceStaleness,
    AdviceStalenessKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const ADVISOR_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
);
const KIND_LITERAL = /['"](?:stale|fresh)['"]/;
const ENUM_MEMBER_DECLARATION = /^\s*\w+ = ['"](?:stale|fresh)['"],?\s*$/;

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

describe('the advice staleness kind is an enum (PT-104, F-118, F-133)', () => {
    it('declares Fresh and Stale as the only kinds', () => {
        expect(
            Object.values(AdviceStalenessKind).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toStrictEqual(['fresh', 'stale']);
    });

    it('returns the enum members from adviceStaleness', () => {
        const fresh = adviceStaleness({
            asOf: '2026-09-22',
            fundedStaleDays: 7,
            planRulesFingerprint: null,
            stage: SizingStage.Eval,
            today: '2026-09-23',
        });
        const stale = adviceStaleness({
            asOf: '2026-09-21',
            fundedStaleDays: 7,
            planRulesFingerprint: null,
            stage: SizingStage.Eval,
            today: '2026-09-23',
        });

        expect(fresh.kind).toBe(AdviceStalenessKind.Fresh);
        expect(stale.kind).toBe(AdviceStalenessKind.Stale);
    });

    it("leaves no 'stale' or 'fresh' literal comparison under src/lib/prop-calculator/advisor", () => {
        const offenders = filesUnder(ADVISOR_ROOT)
            .map((file) => path.relative(ADVISOR_ROOT, file))
            .flatMap((file) =>
                readFileSync(path.join(ADVISOR_ROOT, file), 'utf8')
                    .split('\n')
                    .map((line, index) => ({ file, index: index + 1, line }))
                    .filter(
                        ({ line }) =>
                            KIND_LITERAL.test(line) &&
                            !ENUM_MEMBER_DECLARATION.test(line),
                    )
                    .map(({ file: where, index }) => `${where}:${index}`),
            );

        expect(offenders).toStrictEqual([]);
    });
});
