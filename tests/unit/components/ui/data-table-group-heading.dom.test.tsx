import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from '~/components/ui/data-table';

interface Line {
    heading: null | string;
    id: string;
    name: string;
}

const COLUMNS: DataTableColumn<Line>[] = [
    { accessorKey: 'name', header: 'Plan', id: 'name' },
];

const LINES: Line[] = [
    { heading: 'Alpha Futures', id: 'firm-alpha', name: '' },
    { heading: null, id: 'plan-1', name: 'Zero 50K' },
];

describe('a DataTable group heading', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('reads as a sentence-case row heading, not an uppercase column label', () => {
        act(() => {
            root.render(
                <DataTable<Line>
                    columns={COLUMNS}
                    data={LINES}
                    isSortable={false}
                    pageSize={null}
                    rowGroupHeading={(line) => line.heading}
                    rowId={(line) => line.id}
                />,
            );
        });
        const heading = container.querySelector<HTMLElement>(
            ':scope th[scope="rowgroup"]',
        );
        expect(heading?.textContent).toBe('Alpha Futures');
        expect(heading?.className).not.toContain('type-micro');
        expect(heading?.className).toContain('whitespace-normal');
    });
});
