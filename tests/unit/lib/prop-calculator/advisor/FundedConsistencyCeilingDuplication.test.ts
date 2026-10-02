import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const MAX_DAY_PROFIT_BEFORE_VIOLATION = /\.maxDayProfitBeforeViolation\(/g;

function occurrencesIn(relativePath: string): number {
    const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return (text.match(MAX_DAY_PROFIT_BEFORE_VIOLATION) ?? []).length;
}

describe('funded consistency ceiling duplication (PT-24b step 4)', () => {
    it('CopyGroupSizing delegates to the exported fundedConsistencyCeiling instead of its own copy', () => {
        expect(
            occurrencesIn('src/lib/prop-calculator/advisor/CopyGroupSizing.ts'),
        ).toBe(0);
    });

    it('computes the funded consistency ceiling in exactly one place across the ceiling module and CopyGroupSizing', () => {
        const total =
            occurrencesIn(
                'src/lib/prop-calculator/advisor/FundedConsistencyCeiling.ts',
            ) +
            occurrencesIn('src/lib/prop-calculator/advisor/CopyGroupSizing.ts');
        expect(total).toBe(1);
    });
});

const PAYOUT_REQUEST_DECISION_CHECK = /PayoutRequestDecisionKind\.Request/g;

function payoutRequestDecisionCheckOccurrencesIn(relativePath: string): number {
    const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return (text.match(PAYOUT_REQUEST_DECISION_CHECK) ?? []).length;
}

describe('payoutEligibleForRiskCheck duplication (review HIGH)', () => {
    it('FundedSizingAdvisor and LiveSizingAdvisor delegate to the base isPayoutRequestDecision instead of their own copy', () => {
        expect(
            payoutRequestDecisionCheckOccurrencesIn(
                'src/lib/prop-calculator/advisor/FundedSizingAdvisor.ts',
            ),
        ).toBe(0);
        expect(
            payoutRequestDecisionCheckOccurrencesIn(
                'src/lib/prop-calculator/advisor/LiveSizingAdvisor.ts',
            ),
        ).toBe(0);
    });

    it('checks the payout-request decision in exactly one place across the three advisor files', () => {
        const total =
            payoutRequestDecisionCheckOccurrencesIn(
                'src/lib/prop-calculator/advisor/SizingAdvisor.ts',
            ) +
            payoutRequestDecisionCheckOccurrencesIn(
                'src/lib/prop-calculator/advisor/FundedConsistencyCeiling.ts',
            ) +
            payoutRequestDecisionCheckOccurrencesIn(
                'src/lib/prop-calculator/advisor/LiveSizingAdvisor.ts',
            );
        expect(total).toBe(1);
    });
});

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('SizingAdvisor context template method (review MEDIUM)', () => {
    const LIVE_PATH = 'src/lib/prop-calculator/advisor/LiveSizingAdvisor.ts';
    const BASE_PATH = 'src/lib/prop-calculator/advisor/SizingAdvisor.ts';

    it.each(['checkNextTradeRisk(', 'dailyPlanCard(', 'documented('])(
        'LiveSizingAdvisor does not redeclare %s and only overrides the nullable context builder',
        (member) => {
            const declaration = new RegExp(
                `^    ${member.replace('(', String.raw`\(`)}`,
                'm',
            );
            expect(sourceOf(LIVE_PATH)).not.toMatch(declaration);
            expect(sourceOf(BASE_PATH)).toMatch(declaration);
        },
    );

    it('LiveSizingAdvisor overrides buildContextOrNull', () => {
        expect(sourceOf(LIVE_PATH)).toMatch(
            /buildContextOrNull\(\): LiveRuleContext \| null/,
        );
    });
});
