import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { EVAL_DISCOUNT_REBUY_NOTE } from '~/app/(app)/prop-calculator/_components/evalDiscountRebuyNote';
import { tradingInputBounds } from '~/app/(app)/prop-calculator/_components/tradingInputBounds';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_components',
);

function componentSource(fileName: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, fileName), 'utf8');
}

function inputElement(source: string, id: string): string {
    const match = new RegExp(String.raw`<Input\s[^]*?id="${id}"[^]*?/>`).exec(
        source,
    );
    if (match === null) throw new Error(`no <Input id="${id}"> found`);
    const element = match[0];
    return element.slice(element.lastIndexOf('<Input'));
}

function relativeImports(source: string): string[] {
    return source
        .matchAll(/^\s*import\s[^;]*?from\s+'(\.[^']+)';$/gm)
        .map((match) => match[1] ?? '')
        .toArray();
}

describe('tradingInputBounds', () => {
    it('takes the trials bounds from CALCULATOR_SCALAR_BOUNDS', () => {
        const { trials } = tradingInputBounds();
        expect(trials.min).toBe(CALCULATOR_SCALAR_BOUNDS.trials.min);
        expect(trials.max).toBe(CALCULATOR_SCALAR_BOUNDS.trials.max);
        expect(trials.step).toBe(100);
    });

    it('takes the max eval days bounds from CALCULATOR_SCALAR_BOUNDS', () => {
        const { maxEvalDays } = tradingInputBounds();
        expect(maxEvalDays.min).toBe(CALCULATOR_SCALAR_BOUNDS.maxDays.min);
        expect(maxEvalDays.max).toBe(CALCULATOR_SCALAR_BOUNDS.maxDays.max);
        expect(maxEvalDays.step).toBe(5);
    });

    it('caps the funded horizon at the UI max of 730 days, below the URL bound', () => {
        const { fundedHorizonDays } = tradingInputBounds();
        expect(fundedHorizonDays.max).toBe(730);
        expect(fundedHorizonDays.max).toBeLessThan(
            CALCULATOR_SCALAR_BOUNDS.fundedDays.max,
        );
        expect(fundedHorizonDays.min).toBe(
            CALCULATOR_SCALAR_BOUNDS.fundedDays.min,
        );
        expect(fundedHorizonDays.step).toBe(1);
    });

    it('hands out read-only bounds so no caller can change them for every input', () => {
        interface ReadonlyBound {
            readonly max: number;
            readonly min: number;
            readonly step: number;
        }
        expectTypeOf(tradingInputBounds()).toEqualTypeOf<{
            readonly fundedHorizonDays: ReadonlyBound;
            readonly maxEvalDays: ReadonlyBound;
            readonly trials: ReadonlyBound;
        }>();
    });

    it('keeps every UI bound inside its URL bound', () => {
        const bounds = tradingInputBounds();
        const pairs = [
            [bounds.trials, CALCULATOR_SCALAR_BOUNDS.trials],
            [bounds.maxEvalDays, CALCULATOR_SCALAR_BOUNDS.maxDays],
            [bounds.fundedHorizonDays, CALCULATOR_SCALAR_BOUNDS.fundedDays],
        ] as const;
        for (const [ui, url] of pairs) {
            expect(ui.min).toBeGreaterThanOrEqual(url.min);
            expect(ui.max).toBeLessThanOrEqual(url.max);
            expect(ui.min).toBeLessThan(ui.max);
        }
    });
});

describe('the funded horizon bound lives outside the client hook (F-23)', () => {
    it('tradingInputBounds imports no client module', () => {
        const specifiers = relativeImports(
            componentSource('tradingInputBounds.ts'),
        );
        for (const specifier of specifiers) {
            const file = `${specifier.replace(/^\.\//, '')}.ts`;
            expect(componentSource(file)).not.toMatch(/^'use client';/m);
        }
        expect(componentSource('tradingInputBounds.ts')).not.toMatch(
            /^'use client';/m,
        );
    });

    it('the calculator hook holds no horizon constant of its own', () => {
        const hook = componentSource('useCalculator.ts');
        expect(hook).not.toMatch(/FUNDED_HORIZON_UI_MAX_DAYS/);
        expect(hook).toContain('tradingInputBounds().fundedHorizonDays.max');
    });

    it('the funded horizon input carries no numeric literal and binds to tradingInputBounds', () => {
        const source = componentSource('CalculatorInputsForm.tsx');
        const element = inputElement(source, 'funded-horizon-days');
        expect(element).not.toMatch(/(?:min|max|step)=\{\d/);
        expect(element).toContain('max={bounds.fundedHorizonDays.max}');
        expect(element).toContain('min={bounds.fundedHorizonDays.min}');
        expect(element).toContain('step={bounds.fundedHorizonDays.step}');
        expect(source).toContain('const bounds = tradingInputBounds();');
        expect(source).not.toMatch(/FUNDED_HORIZON_UI_MAX_DAYS/);
    });
});

describe('TradingInputs bounds come from one place (F-24)', () => {
    const source = componentSource('TradingInputs.tsx');

    it.each(['trials', 'max-eval-days'])(
        'the %s input carries no numeric min, max or step literal',
        (id) => {
            const element = inputElement(source, id);
            expect(element).not.toMatch(/(?:min|max|step)=\{\d/);
            expect(element).toMatch(/max=\{bounds\.[\w.]+\.max\}/);
            expect(element).toMatch(/min=\{bounds\.[\w.]+\.min\}/);
            expect(element).toMatch(/step=\{bounds\.[\w.]+\.step\}/);
        },
    );

    it('reads the bounds through tradingInputBounds', () => {
        expect(source).toContain('tradingInputBounds()');
    });
});

describe('FirmPlanPicker resolves the plan serial through TradingFirm (F-25)', () => {
    const source = componentSource('FirmPlanPicker.tsx');

    it('has no hand-written plan-serial scan', () => {
        expect(source).not.toMatch(/serializePlanId\(\w+\.id\)\s*===/);
    });

    it('uses findPlanBySerial', () => {
        expect(source).toContain('firm.findPlanBySerial(');
    });
});

describe('Eval fee discount re-buy note (decision T9)', () => {
    it('says the percentage also prices every re-buy', () => {
        expect(EVAL_DISCOUNT_REBUY_NOTE).toContain(
            'also prices every re-buy after a failed attempt',
        );
    });

    it('names only the retries that come out under-priced, matching the FundedNext coupon note', () => {
        expect(EVAL_DISCOUNT_REBUY_NOTE).toContain(
            'a code whose repeat purchases cost more than its first purchase under-prices those retries',
        );
        expect(EVAL_DISCOUNT_REBUY_NOTE).toContain(
            'every FundedNext RAPID retry',
        );
        expect(EVAL_DISCOUNT_REBUY_NOTE).toContain(
            'FNFLEX retries from the 3rd purchase',
        );
        expect(EVAL_DISCOUNT_REBUY_NOTE).not.toContain('each retry');
    });

    it('has no em dash', () => {
        expect(EVAL_DISCOUNT_REBUY_NOTE).not.toContain('—');
    });

    it('renders next to the Eval fee discount input', () => {
        const source = componentSource('TradingInputs.tsx');
        const labelAt = source.indexOf('Eval fee discount');
        const inputAt = source.indexOf('id="eval-discount"');
        const noteAt = source.indexOf('{EVAL_DISCOUNT_REBUY_NOTE}');
        const nextLabelAt = source.indexOf('Activation fee discount');
        expect(labelAt).toBeGreaterThan(-1);
        expect(noteAt).toBeGreaterThan(inputAt);
        expect(noteAt).toBeLessThan(nextLabelAt);
    });
});
