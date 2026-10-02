import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const ADVISOR_DIR = 'src/lib/prop-calculator/advisor';
const POLICY_DIR = `${ADVISOR_DIR}/policy`;

function occurrences(text: string, pattern: RegExp): number {
    return (text.match(pattern) ?? []).length;
}

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('one personal day-limit rule (PT-68h, F-V16)', () => {
    it('applies both limits through the documented rule resolveNextTrade, never a second loss-room or profit-room formula', () => {
        const text = sourceOf(`${POLICY_DIR}/PersonalDayLimits.ts`);

        expect(occurrences(text, /resolveNextTrade\(/g)).toBe(1);
        expect(text).not.toContain('capRiskToRemainingDailyLoss');
        expect(text).not.toContain('resolveDailyLossRoom');
    });

    it('keeps one day-progress ledger across the policy folder', () => {
        const total = readdirSync(path.join(REPO_ROOT, POLICY_DIR))
            .filter((file) => file.endsWith('.ts'))
            .reduce(
                (sum, file) =>
                    sum +
                    occurrences(
                        sourceOf(`${POLICY_DIR}/${file}`),
                        /wins: wins \+ 1/g,
                    ),
                0,
            );

        expect(total).toBe(1);
    });

    it.each(['EngineOptimumRunner.ts', 'NextPayoutProjection.ts'])(
        '%s reaches the limits through applyPersonalDayLimits or ladderUnderPersonalDayLimits only',
        (file) => {
            const text = sourceOf(`${ADVISOR_DIR}/${file}`);

            expect(
                occurrences(
                    text,
                    /applyPersonalDayLimits\(|ladderUnderPersonalDayLimits\(/g,
                ),
            ).toBeGreaterThan(0);
            expect(text).not.toContain('personalDll');
            expect(text).not.toContain('dailyProfitCap');
        },
    );
});
