import { describe, expect, it } from 'vitest';

import {
    dataTableFilterFns,
    dataTableSortFns,
} from '~/components/ui/DataTable.features';

function row(value: unknown) {
    return { getValue: () => value } as never;
}

describe('dataTableSortFns', () => {
    it('sorts strings case-insensitively via text', () => {
        const values = ['Zebra', 'apple', 'banana'];
        const sorted = values.toSorted((a, b) =>
            dataTableSortFns.text(row(a), row(b), 'value'),
        );
        expect(sorted).toEqual(['apple', 'banana', 'Zebra']);
    });

    it('sorts strings by raw code units via basic (the pre-fix default)', () => {
        const values = ['Zebra', 'apple', 'banana'];
        const sorted = values.toSorted((a, b) =>
            dataTableSortFns.basic(row(a), row(b), 'value'),
        );
        expect(sorted).toEqual(['Zebra', 'apple', 'banana']);
    });

    it('sorts alphanumeric strings by numeric chunk, not lexically', () => {
        const values = ['Item 10', 'Item 2', 'Item 9'];
        const sorted = values.toSorted((a, b) =>
            dataTableSortFns.alphanumeric(row(a), row(b), 'value'),
        );
        expect(sorted).toEqual(['Item 2', 'Item 9', 'Item 10']);
    });

    it('registers every name auto-sort can request', () => {
        expect(
            Object.keys(dataTableSortFns).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(['alphanumeric', 'basic', 'datetime', 'text']);
    });
});

describe('dataTableFilterFns', () => {
    it('equals does not match a substring', () => {
        expect(
            dataTableFilterFns.equals(row('Financial'), 'value', 'Fin'),
        ).toBe(false);
    });

    it('includesString matches a lowercased substring', () => {
        expect(
            dataTableFilterFns.includesString(row('Financial'), 'value', 'fin'),
        ).toBe(true);
    });

    it('registers every name auto-filter can request', () => {
        expect(
            Object.keys(dataTableFilterFns).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual([
            'arrIncludes',
            'equals',
            'includesString',
            'inDateRange',
            'inNumberRange',
            'weakEquals',
        ]);
    });
});
