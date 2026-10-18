import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableServerPaginationControls } from '~/components/ui/data-table-pagination';

describe('the server pagination footer', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(rowCount: number, totalCount?: number) {
        act(() => {
            root.render(
                <DataTableServerPaginationControls
                    pagination={{
                        hasNextPage: true,
                        onPageIndexChange: vi.fn(),
                        pageIndex: 1,
                        pageSize: 25,
                        totalCount,
                    }}
                    rowCount={rowCount}
                />,
            );
        });
    }

    function label(): string {
        return container.querySelector(':scope span')?.textContent ?? '';
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
        vi.unstubAllGlobals();
    });

    it('names the rows on the page and the total when the server knows it', () => {
        render(25, 1312);
        expect(label()).toBe('26 to 50 of 1,312');
    });

    it('names only the rows on the page when the total is unknown', () => {
        render(25);
        expect(label()).toBe('26 to 50');
    });

    it('says there are no results on an empty page', () => {
        render(0, 25);
        expect(label()).toBe('No results');
    });
});
