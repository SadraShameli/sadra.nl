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

export enum BankrollProjectionUrlParameter {
    CompareDaysA = 'bkda',
    CompareDaysB = 'bkdb',
    CompareMultipleA = 'bkxa',
    CompareMultipleB = 'bkxb',
    CycleDays = 'bkd',
    CycleMultiple = 'bkx',
    RoundBudget = 'bkq',
}

export interface BankrollProjectionUrlState {
    readonly compareCycleDaysA: null | number;
    readonly compareCycleDaysB: null | number;
    readonly compareMultipleA: null | number;
    readonly compareMultipleB: null | number;
    readonly cycleDays: null | number;
    readonly cycleMultiple: null | number;
    readonly roundBudget: Dollars | null;
}

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

export type BankrollViewState = BankrollProjectionUrlState & BankrollUrlState;

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

const multipleSchema = finiteNumberSchema.pipe(z.number().positive());

const reinvestFractionSchema = finiteNumberSchema
    .pipe(z.number().min(0).max(1))
    .transform(fraction);

const lossThresholdSchema = finiteNumberSchema
    .pipe(rulebookSchema.shape.bankroll.shape.lossRiskThreshold.unwrap())
    .transform(fraction);

export function decodeBankrollProjectionUrlState(
    parameters: URLSearchParams,
): BankrollProjectionUrlState {
    return {
        compareCycleDaysA: parsed(
            positiveIntSchema,
            parameters.get(BankrollProjectionUrlParameter.CompareDaysA),
        ),
        compareCycleDaysB: parsed(
            positiveIntSchema,
            parameters.get(BankrollProjectionUrlParameter.CompareDaysB),
        ),
        compareMultipleA: parsed(
            multipleSchema,
            parameters.get(BankrollProjectionUrlParameter.CompareMultipleA),
        ),
        compareMultipleB: parsed(
            multipleSchema,
            parameters.get(BankrollProjectionUrlParameter.CompareMultipleB),
        ),
        cycleDays: parsed(
            positiveIntSchema,
            parameters.get(BankrollProjectionUrlParameter.CycleDays),
        ),
        cycleMultiple: parsed(
            multipleSchema,
            parameters.get(BankrollProjectionUrlParameter.CycleMultiple),
        ),
        roundBudget: parsed(
            dollarsSchema,
            parameters.get(BankrollProjectionUrlParameter.RoundBudget),
        ),
    };
}

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

export function decodeBankrollViewState(
    parameters: URLSearchParams,
): BankrollViewState {
    return {
        ...decodeBankrollUrlState(parameters),
        ...decodeBankrollProjectionUrlState(parameters),
    };
}

export function defaultBankrollProjectionUrlState(): BankrollProjectionUrlState {
    return {
        compareCycleDaysA: null,
        compareCycleDaysB: null,
        compareMultipleA: null,
        compareMultipleB: null,
        cycleDays: null,
        cycleMultiple: null,
        roundBudget: null,
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

export function encodeBankrollProjectionUrlState(
    state: BankrollProjectionUrlState,
    omitted: readonly BankrollProjectionUrlParameter[] = [],
): string {
    const parameters = new URLSearchParams();
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.RoundBudget,
        state.roundBudget,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CycleMultiple,
        state.cycleMultiple,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CycleDays,
        state.cycleDays,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CompareMultipleA,
        state.compareMultipleA,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CompareDaysA,
        state.compareCycleDaysA,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CompareMultipleB,
        state.compareMultipleB,
    );
    setIfPresent(
        parameters,
        BankrollProjectionUrlParameter.CompareDaysB,
        state.compareCycleDaysB,
    );
    for (const key of omitted) parameters.delete(key);
    return parameters.toString();
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

export function parseBankrollMultipleField(raw: string): null | number {
    return parsed(multipleSchema, raw);
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
    key: BankrollProjectionUrlParameter | BankrollUrlParameter,
    value: null | number,
): void {
    if (value !== null) parameters.set(key, String(value));
}
