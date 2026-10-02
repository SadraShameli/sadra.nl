import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountSubstate,
    type EvalSizingAdvisorInput,
    type FundedSizingAdvisorInput,
    type LiveSizingAdvisorInput,
    type SizingAdvisorCreateOptions,
} from '~/lib/prop-calculator/advisor';

type IsOptional<T, K extends keyof T> = object extends Pick<T, K>
    ? true
    : false;

describe('substate is required but nullable on every advisor input (PT-19i, F-118)', () => {
    it('is null or Suspended, never undefined, on the factory options and on the Eval, Funded and Live inputs', () => {
        expectTypeOf<
            SizingAdvisorCreateOptions['substate']
        >().toEqualTypeOf<AccountSubstate.Suspended | null>();
        expectTypeOf<
            EvalSizingAdvisorInput['substate']
        >().toEqualTypeOf<AccountSubstate.Suspended | null>();
        expectTypeOf<
            FundedSizingAdvisorInput['substate']
        >().toEqualTypeOf<AccountSubstate.Suspended | null>();
        expectTypeOf<
            LiveSizingAdvisorInput['substate']
        >().toEqualTypeOf<AccountSubstate.Suspended | null>();
        expect(true).toBe(true);
    });

    it('cannot be left out of any of them, so the compiler flags an omission', () => {
        expectTypeOf<
            IsOptional<SizingAdvisorCreateOptions, 'substate'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            IsOptional<EvalSizingAdvisorInput, 'substate'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            IsOptional<FundedSizingAdvisorInput, 'substate'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            IsOptional<LiveSizingAdvisorInput, 'substate'>
        >().toEqualTypeOf<false>();
        expect(true).toBe(true);
    });
});
