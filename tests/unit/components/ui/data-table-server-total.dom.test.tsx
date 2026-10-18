import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from '~/components/ui/data-table';

import { typeInto } from '../formDialog';

interface Ledger {
    readonly name: string;
}

const COLUMNS: DataTableColumn<Ledger>[] = [
    { accessorKey: 'name', header: 'Ledger', meta: { isRowHeader: true } },
];

const ROWS: Ledger[] = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }];

const SERVER_TOTAL = 300;

describe('a server-paged table with its own search box', () => {
    let container: HTMLDivElement;
    let root: Root;

    function footer(): string {
        return (
            [...container.querySelectorAll(':scope span.tabular-nums')].at(-1)
                ?.textContent ?? ''
        );
    }

    function search(text: string): void {
        const input = container.querySelector(':scope input');
        if (!(input instanceof HTMLInputElement))
            throw new TypeError('No search');
        typeInto(input, text);
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <DataTable
                    columns={COLUMNS}
                    data={ROWS}
                    serverPagination={{
                        hasNextPage: true,
                        onPageIndexChange: vi.fn(),
                        pageIndex: 0,
                        pageSize: 25,
                        totalCount: SERVER_TOTAL,
                    }}
                    showFilter
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('names the server total while nothing is filtered', () => {
        expect(footer()).toBe('1 to 3 of 300');
    });

    it('stops claiming the server total once the search hides rows', () => {
        search('Alp');
        expect(footer()).toBe('1 to 1');
    });
});
