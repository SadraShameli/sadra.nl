import { type ArgsDef, parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    planArguments,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { FirmId, MffuVariant, type Plan } from '~/lib/prop-calculator';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const ARGS = { ...planArguments, ...tradingArguments } satisfies ArgsDef;

function mffPlan(variant: MffuVariant): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFF ${variant} 50K plan not found`);
    return plan;
}

function parseTradingInputs(argv: string[]): TradingInputs {
    return TradingInputs.parse(parseArgs<typeof ARGS>(argv, ARGS));
}

describe('--early-withdrawal (N-64, T30: the MFF Pro one-time early withdrawal is an opt-in, off by default)', () => {
    it('is a boolean trading flag that defaults to off', () => {
        expect(tradingArguments['early-withdrawal']).toMatchObject({
            default: false,
            type: 'boolean',
        });
        expect(parseTradingInputs([]).takesOneTimeEarlyWithdrawal).toBe(false);
        expect(
            parseTradingInputs(['--early-withdrawal'])
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('opts MFF Pro into the rule only when the flag is set', () => {
        const pro = mffPlan(MffuVariant.Pro);

        expect(
            parseTradingInputs([]).toSimInputs(pro).plan
                .takesOneTimeEarlyWithdrawal,
        ).toBe(false);
        expect(
            parseTradingInputs(['--early-withdrawal']).toSimInputs(pro).plan
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('leaves a plan without the rule untouched, so compare can pass the flag across every firm', () => {
        const rapid = mffPlan(MffuVariant.Rapid);

        expect(
            parseTradingInputs(['--early-withdrawal']).toSimInputs(rapid).plan,
        ).toBe(rapid);
    });

    it('describes the rule, the opt-in and the thin cushion it leaves in its help text, without em dashes', () => {
        const description = tradingArguments['early-withdrawal'].description;

        expect(description).toContain('60%');
        expect(description).toContain('$1,000');
        expect(description).toContain('start + $100');
        expect(description).not.toContain('\u{2014}');
    });
});
