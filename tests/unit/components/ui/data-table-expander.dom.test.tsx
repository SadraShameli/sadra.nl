import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DataTable,
    type DataTableColumn,
    dataTableExpanderColumn,
} from '~/components/ui/data-table';

interface Booking {
    readonly id: string;
    readonly note: string;
}

const COLUMNS: DataTableColumn<Booking>[] = [
    dataTableExpanderColumn<Booking>(),
    { accessorKey: 'id', header: 'Booking', meta: { isRowHeader: true } },
];

describe('the row details toggle', () => {
    let container: HTMLDivElement;
    let root: Root;

    function toggle(): HTMLButtonElement {
        const button = container.querySelector(':scope tbody button');
        if (!(button instanceof HTMLButtonElement)) {
            throw new TypeError('No toggle');
        }
        return button;
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
                    data={[{ id: 'B-1', note: 'Converted from USD' }]}
                    getRowCanExpand={() => true}
                    renderExpanded={(row) => row.original.note}
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

    it('names what it does and says whether the details are open', () => {
        expect(toggle().getAttribute('aria-label')).toBe('Show details');
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        act(() => {
            toggle().click();
        });
        expect(toggle().getAttribute('aria-label')).toBe('Hide details');
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(container.textContent).toContain('Converted from USD');
    });
});
