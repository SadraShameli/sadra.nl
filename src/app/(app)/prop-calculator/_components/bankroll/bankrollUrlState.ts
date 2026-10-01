import { z } from 'zod';

import {
    dollars,
    type Dollars,
    floorToWholeCents,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator';
import { rulebookSchema } from '~/lib/prop-calculator/advisor';
import { BankrollUrlParameter } from '~/lib/schemas/bankrollUrlParameter';

export interface BankrollUrlState {
    readonly budget: Dollars | null;
    readonly capacity: null | number;
    readonly horizonDays: null | number;
    readonly lossThreshold: Fraction0to1 | null;
    readonly monthlyBudget: Dollars | null;
    readonly payoutLagDays: null | number;
    readonly reinvestFraction: Fraction0to1 | null;
    readonly start: Dollars | null;
}

const finiteNumberSchema = z.string().trim().min(1).pipe(z.coerce.number());

const dollarsSchema = finiteNumberSchema
    .pipe(z.number().positive())
    .transform(floorToWholeCents)
    .pipe(z.number().positive())
    .transform(dollars);

const positiveIntSchema = finiteNumberSchema.pipe(z.number().int().positive());

const nonNegativeIntSchema = finiteNumberSchema.pipe(
    z.number().int().nonnegative(),
);

const reinvestFractionSchema = finiteNumberSchema
    .pipe(z.number().min(0).max(1))
    .transform(fraction);

const lossThresholdSchema = finiteNumberSchema
    .pipe(rulebookSchema.shape.bankroll.shape.lossRiskThreshold.unwrap())
    .transform(fraction);

export function decodeBankrollUrlState(
    parameters: URLSearchParams,
): BankrollUrlState {
    return {
        budget: parsed(
            dollarsSchema,
            parameters.get(BankrollUrlParameter.Budget),
        ),
        capacity: parsed(
            positiveIntSchema,
            parameters.get(BankrollUrlParameter.Capacity),
        ),
        horizonDays: parsed(
            positiveIntSchema,
            parameters.get(BankrollUrlParameter.HorizonDays),
        ),
        lossThreshold: parsed(
            lossThresholdSchema,
            parameters.get(BankrollUrlParameter.LossThreshold),
        ),
        monthlyBudget: parsed(
            dollarsSchema,
            parameters.get(BankrollUrlParameter.MonthlyBudget),
        ),
        payoutLagDays: parsed(
            nonNegativeIntSchema,
            parameters.get(BankrollUrlParameter.PayoutLagDays),
        ),
        reinvestFraction: parsed(
            reinvestFractionSchema,
            parameters.get(BankrollUrlParameter.Reinvest),
        ),
        start: parsed(
            dollarsSchema,
            parameters.get(BankrollUrlParameter.Start),
        ),
    };
}

export function defaultBankrollUrlState(): BankrollUrlState {
    return {
        budget: null,
        capacity: null,
        horizonDays: null,
        lossThreshold: null,
        monthlyBudget: null,
        payoutLagDays: null,
        reinvestFraction: null,
        start: null,
    };
}

export function encodeBankrollUrlState(
    state: BankrollUrlState,
    omitted: readonly BankrollUrlParameter[] = [],
): string {
    const parameters = new URLSearchParams();
    setIfPresent(parameters, BankrollUrlParameter.Budget, state.budget);
    setIfPresent(parameters, BankrollUrlParameter.Start, state.start);
    setIfPresent(
        parameters,
        BankrollUrlParameter.MonthlyBudget,
        state.monthlyBudget,
    );
    setIfPresent(
        parameters,
        BankrollUrlParameter.Reinvest,
        state.reinvestFraction,
    );
    setIfPresent(parameters, BankrollUrlParameter.Capacity, state.capacity);
    setIfPresent(
        parameters,
        BankrollUrlParameter.PayoutLagDays,
        state.payoutLagDays,
    );
    setIfPresent(
        parameters,
        BankrollUrlParameter.HorizonDays,
        state.horizonDays,
    );
    setIfPresent(
        parameters,
        BankrollUrlParameter.LossThreshold,
        state.lossThreshold,
    );
    for (const key of omitted) parameters.delete(key);
    return parameters.toString();
}

export function parseBankrollDollarsField(raw: string): Dollars | null {
    return parsed(dollarsSchema, raw);
}

export function parseBankrollLossThresholdField(
    raw: string,
): Fraction0to1 | null {
    return parsed(lossThresholdSchema, raw);
}

export function parseBankrollNonNegativeIntField(raw: string): null | number {
    return parsed(nonNegativeIntSchema, raw);
}

export function parseBankrollPositiveIntField(raw: string): null | number {
    return parsed(positiveIntSchema, raw);
}

export function parseBankrollReinvestFractionField(
    raw: string,
): Fraction0to1 | null {
    return parsed(reinvestFractionSchema, raw);
}

function parsed<T>(schema: z.ZodType<T>, raw: null | string): null | T {
    if (raw === null) return null;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
}

function setIfPresent(
    parameters: URLSearchParams,
    key: BankrollUrlParameter,
    value: null | number,
): void {
    if (value !== null) parameters.set(key, String(value));
}
