import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as leaf from '~/lib/schemas/calculatorUrlParameter';
import * as url from '~/lib/schemas/url';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const FIRM_KEY_CHECKERS = [
    path.join(
        SOURCE_ROOT,
        'app',
        '(app)',
        'prop-calculator',
        '_components',
        'useCalculator.ts',
    ),
];

describe('the calculator URL parameter leaf module (PT-11h)', () => {
    it('is the enum url.ts re-exports, not a second copy', () => {
        expect(url.CalculatorUrlParameter).toBe(leaf.CalculatorUrlParameter);
        expect(url.UrlFlag).toBe(leaf.UrlFlag);
    });

    it('keeps the query keys and flag values that shared links already carry', () => {
        expect({ ...leaf.CalculatorUrlParameter }).toEqual({
            EarlyWithdrawal: 'ew',
            Firm: 'firm',
            FundedReset: 'qr',
            IdleDayProbability: 'idle',
            Plan: 'plan',
            RebuyLagDays: 'rebuyLag',
        });
        expect({ ...leaf.UrlFlag }).toEqual({ Off: '0', On: '1' });
    });

    it.each(FIRM_KEY_CHECKERS.map((file) => path.relative(SOURCE_ROOT, file)))(
        '%s checks the firm key through CalculatorUrlParameter.Firm',
        (file) => {
            const source = readFileSync(path.join(SOURCE_ROOT, file), 'utf8');
            expect(source).not.toMatch(/\.has\(\s*'firm'\s*\)/);
            expect(source).toMatch(
                /\.has\(\s*CalculatorUrlParameter\.Firm\s*\)/,
            );
        },
    );
});
