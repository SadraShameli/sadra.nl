import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    personalPayoutOverrideWarningText,
    RETAINED_CUSHION_BASIS_TEXT,
    RetainedCushionBasis,
} from '~/lib/prop-calculator/advisor';

const SOURCE_ROOT = path.join(process.cwd(), 'src');

function sourceOf(...segments: string[]): string {
    return readFileSync(path.join(SOURCE_ROOT, ...segments), 'utf8');
}

function warningOf(
    overrides: Partial<Parameters<typeof personalPayoutOverrideWarningText>[0]>,
): string {
    return personalPayoutOverrideWarningText({
        horizonDays: 252,
        optimumBustProbability: 0.12,
        optimumMonthlyNet: 4321,
        optimumRequestSize: 2000,
        overrideBustProbability: 0.34,
        overrideMonthlyNet: 1234,
        overrideRequestSize: 750,
        retainedCushion: 2750,
        retainedCushionBasis: RetainedCushionBasis.RulebookSize,
        ...overrides,
    });
}

describe('one retained-cushion basis wording for the planner, the value chain and the warning (PT-19i LOW a)', () => {
    it('words every basis so it reads after "from" and inside parentheses', () => {
        expect(RETAINED_CUSHION_BASIS_TEXT).toEqual({
            [RetainedCushionBasis.HardRule2Default]: "Hard Rule 2's minimum",
            [RetainedCushionBasis.LiveOneDrawdown]: 'one live drawdown',
            [RetainedCushionBasis.PersonalOverride]: 'your personal override',
            [RetainedCushionBasis.RulebookSize]:
                "your rulebook's retained cushion",
        });
        for (const text of Object.values(RETAINED_CUSHION_BASIS_TEXT)) {
            expect(text).not.toContain('\u{2014}');
            expect(text).toBe(text.trim());
        }
    });

    it('keeps no second basis table in the value chain', () => {
        const source = sourceOf(
            'lib',
            'prop-calculator',
            'advisor',
            'value',
            'ValueChain.ts',
        );

        expect(source).not.toMatch(/const RETAINED_CUSHION_BASIS_TEXT/);
        expect(source).toContain('documentedRetainedCushionResolution');
    });

    it('keeps no second basis table in the payout planner view', () => {
        const source = sourceOf(
            'app',
            '(app)',
            'prop-calculator',
            '(tools)',
            'payout-planner',
            'PayoutPlannerView.tsx',
        );

        expect(source).not.toMatch(/const RETAINED_CUSHION_BASIS_TEXT/);
    });
});

describe('the payout override warning names its monthly net as the credit-inclusive figure (PT-19i LOW c)', () => {
    it('says credit-inclusive monthly net, the figure the sweep ranks by', () => {
        const text = personalPayoutOverrideWarningText({
            horizonDays: 252,
            optimumBustProbability: 0.12,
            optimumMonthlyNet: 4321,
            optimumRequestSize: 2000,
            overrideBustProbability: 0.34,
            overrideMonthlyNet: 1234,
            overrideRequestSize: 750,
            retainedCushion: 2750,
            retainedCushionBasis: RetainedCushionBasis.RulebookSize,
        });

        expect(text).toContain('credit-inclusive monthly net');
        expect(text).toContain('$1,234 at a $750 request');
    });

    it('says the request underperforms only when its monthly net is lower', () => {
        expect(warningOf({})).toContain('underperforms');
    });

    it('says the bust probability is higher, not that it underperforms, when the override earns more', () => {
        const text = warningOf({
            overrideBustProbability: 0.4,
            overrideMonthlyNet: 5000,
        });

        expect(text).not.toContain('underperforms');
        expect(text).toContain('earns more');
        expect(text).toContain('higher bust probability');
    });

    it('says the sweep best row is not the best size when the override earns more beyond the band at no worse bust', () => {
        const text = warningOf({
            overrideBustProbability: 0.1,
            overrideMonthlyNet: 5000,
        });

        expect(text).not.toContain('underperforms');
        expect(text).not.toContain('higher bust probability');
        expect(text).toContain('not the best size');
    });
});
