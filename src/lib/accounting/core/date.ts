import { addDays, format } from 'date-fns';
import { z } from 'zod';

export const isoDateSchema = z.iso.date().brand('IsoDate');
export type ISODate = z.infer<typeof isoDateSchema>;

const DATE_FORMAT = 'yyyy-MM-dd';

const toLocalMidnight = (date: ISODate): Date => {
    const [year, month, day] = date.split('-').map(Number) as [
        number,
        number,
        number,
    ];
    return new Date(year, month - 1, day);
};

export const IsoDate = {
    addDays: (date: ISODate, n: number): ISODate => {
        const shifted = addDays(toLocalMidnight(date), n);
        return isoDateSchema.parse(format(shifted, DATE_FORMAT));
    },

    isAfter: (a: ISODate, b: ISODate): boolean => a > b,

    isBefore: (a: ISODate, b: ISODate): boolean => a < b,

    isSameOrAfter: (a: ISODate, b: ISODate): boolean => a >= b,

    parse: (value: string): ISODate => isoDateSchema.parse(value),

    range: (
        dates: readonly ISODate[],
    ): null | { end: ISODate; start: ISODate } => {
        const sorted = dates.toSorted((a, b) => Number(a > b) - Number(a < b));
        const start = sorted[0];
        const end = sorted.at(-1);
        if (start === undefined || end === undefined) return null;
        return { end, start };
    },

    today: (): ISODate => isoDateSchema.parse(format(new Date(), DATE_FORMAT)),
};
