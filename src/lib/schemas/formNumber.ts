import { z } from 'zod';

const ENTER_A_NUMBER = 'Enter a number';

const ENTER_A_WHOLE_NUMBER = 'Enter a whole number';

const PICK_ONE = 'Pick one';

export function formBoundedNumberSchema({
    isInteger,
    max,
    min,
}: {
    readonly isInteger: boolean;
    readonly max: number;
    readonly min: number;
}) {
    const base = isInteger ? formWholeNumberSchema() : formNumberSchema();
    return base
        .min(min, { error: `Enter ${String(min)} or more` })
        .max(max, { error: `Enter ${String(max)} or less` });
}

export function formChoiceIdSchema() {
    return z.number({ error: PICK_ONE }).int().positive({ error: PICK_ONE });
}

export function formNonNegativeWholeNumberSchema() {
    return formWholeNumberSchema().nonnegative({ error: 'Enter 0 or more' });
}

export function formNumberSchema() {
    return z.number({ error: ENTER_A_NUMBER });
}

export function formPositiveWholeNumberSchema() {
    return formWholeNumberSchema().positive({
        error: 'Enter a number above 0',
    });
}

export function formWholeNumberSchema() {
    return formNumberSchema().int({ error: ENTER_A_WHOLE_NUMBER });
}
