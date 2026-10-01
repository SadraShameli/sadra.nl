import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

describe('Table', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('puts the container props on the scroll container and the table props on the table', () => {
        act(() => {
            root.render(
                <Table
                    aria-labelledby="heading"
                    containerProps={{
                        'aria-labelledby': 'heading',
                        role: 'region',
                        tabIndex: 0,
                    }}
                >
                    <TableHeader>
                        <TableRow>
                            <TableHead scope="col">Name</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell>Row</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>,
            );
        });
        const region = container.querySelector<HTMLElement>('[role="region"]');
        expect(region).not.toBeNull();
        expect(region?.tabIndex).toBe(0);
        expect(region?.getAttribute('aria-labelledby')).toBe('heading');
        expect(region?.className).toContain('overflow-auto');
        const table = region?.querySelector('table');
        expect(table?.getAttribute('aria-labelledby')).toBe('heading');
        expect(table?.hasAttribute('role')).toBe(false);
        expect(table?.hasAttribute('tabindex')).toBe(false);
        expect(table?.querySelector('th')?.scope).toBe('col');
    });

    it('stays a plain scroll container with no role, tab stop or name when no container props are given', () => {
        act(() => {
            root.render(
                <Table>
                    <TableBody>
                        <TableRow>
                            <TableCell>Row</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>,
            );
        });
        const scroll = container.firstElementChild as HTMLElement;
        expect(scroll.tagName).toBe('DIV');
        expect(scroll.hasAttribute('role')).toBe(false);
        expect(scroll.hasAttribute('tabindex')).toBe(false);
        expect(scroll.hasAttribute('aria-labelledby')).toBe(false);
    });
});
