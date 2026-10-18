import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DataTable,
    type DataTableColumn,
    DataTableNarrowLayout,
} from '~/components/ui/data-table';

interface Subscription {
    readonly email: string;
    readonly topic: string;
}

const ROWS: Subscription[] = [{ email: 'a@example.com', topic: 'Readings' }];

const COLUMNS: DataTableColumn<Subscription>[] = [
    { accessorKey: 'email', header: 'Email', meta: { isRowHeader: true } },
    { accessorKey: 'topic', header: 'Topic' },
];

const FRAME_WIDTH_PX = 610;

describe('a data table wider than its panel', () => {
    let container: HTMLDivElement;
    let root: Root;

    function renderAt(
        tableWidthPx: number,
        narrowLayout: DataTableNarrowLayout = DataTableNarrowLayout.Cards,
    ): HTMLElement | null {
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
            FRAME_WIDTH_PX,
        );
        vi.spyOn(
            HTMLElement.prototype,
            'scrollWidth',
            'get',
        ).mockImplementation(function width(this: HTMLElement) {
            return this.tagName === 'TABLE' ? tableWidthPx : FRAME_WIDTH_PX;
        });
        act(() => {
            root.render(
                <DataTable
                    columns={COLUMNS}
                    data={ROWS}
                    narrowLayout={narrowLayout}
                />,
            );
        });
        return container.firstElementChild instanceof HTMLElement
            ? container.firstElementChild
            : null;
    }

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
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('stacks its rows as cards instead of scrolling sideways', () => {
        expect(renderAt(677)?.dataset.tableCards).toBe('true');
    });

    it('stays a table when it fits', () => {
        expect(renderAt(540)?.dataset.tableCards).toBeUndefined();
    });

    it('keeps the current row marked in the card layout, where cards would otherwise paint over it', () => {
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
            FRAME_WIDTH_PX,
        );
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(
            FRAME_WIDTH_PX,
        );
        act(() => {
            root.render(
                <DataTable
                    columns={COLUMNS}
                    data={ROWS}
                    isCurrentRow={(row) => row.topic === 'Readings'}
                />,
            );
        });
        const row = container.querySelector(':scope tbody tr');
        expect(row?.getAttribute('aria-current')).toBe('true');
        expect(row?.className).toContain('data-[current=true]:bg-primary/10');
        expect(row?.className).not.toMatch(
            /(?:^|\s)table-cards:bg-card(?:\s|$)/,
        );
    });

    it('goes back to a table once its content fits again', () => {
        const resized: (() => void)[] = [];
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    resized.push(callback);
                }

                disconnect(): void {
                    return;
                }

                observe(): void {
                    return;
                }
            },
        );
        let tableWidthPx = 677;
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
            FRAME_WIDTH_PX,
        );
        vi.spyOn(
            HTMLElement.prototype,
            'scrollWidth',
            'get',
        ).mockImplementation(function width(this: HTMLElement) {
            return this.tagName === 'TABLE' ? tableWidthPx : FRAME_WIDTH_PX;
        });
        act(() => {
            root.render(<DataTable columns={COLUMNS} data={ROWS} />);
        });
        const table = container.firstElementChild;
        expect(table instanceof HTMLElement && table.dataset.tableCards).toBe(
            'true',
        );
        tableWidthPx = 540;
        act(() => {
            for (const callback of resized) callback();
        });
        expect(
            table instanceof HTMLElement ? table.dataset.tableCards : 'none',
        ).toBeUndefined();
    });

    it('keeps scrolling when the table asks for a scrolling layout', () => {
        expect(
            renderAt(677, DataTableNarrowLayout.Scroll)?.dataset.tableCards,
        ).toBeUndefined();
    });
});
