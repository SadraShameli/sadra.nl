import { z } from 'zod';

export type ContractCount = number & { readonly __brand: 'ContractCount' };
export type Dollars = number & { readonly __brand: 'Dollars' };
export type Fraction0to1 = number & { readonly __brand: 'Fraction0to1' };
export type Percent0to100 = number & { readonly __brand: 'Percent0to100' };
export type Points = number & { readonly __brand: 'Points' };
export type ProfitShareMultiplier = number & {
    readonly __brand: 'ProfitShareMultiplier';
};

export function contracts(value: number): ContractCount {
    return value as ContractCount;
}

export function dollars(value: number): Dollars {
    return value as Dollars;
}

export function fraction(value: number): Fraction0to1 {
    return value as Fraction0to1;
}

export function percent(value: number): Percent0to100 {
    return value as Percent0to100;
}

export function points(value: number): Points {
    return value as Points;
}

export function profitShareMultiplier(value: number): ProfitShareMultiplier {
    return value as ProfitShareMultiplier;
}

export const contractCountSchema = z
    .number()
    .int()
    .positive()
    .transform(contracts);

export const dollarsSchema = z.number().transform(dollars);

export const fractionSchema = z.number().min(0).max(1).transform(fraction);

export const percentSchema = z.number().min(0).max(100).transform(percent);

export const pointsSchema = z.number().positive().transform(points);
