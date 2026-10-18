import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RungTable } from '~/app/(app)/prop-calculator/accounts/_components/advice/RungTable';

const GROUP_SIZING_SECTION = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
    'copy-groups',
    'GroupSizingSection.tsx',
);

describe('the shared rung table (PT-101)', () => {
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

    it('names the table, labels its columns and prints one row per rung', () => {
        act(() => {
            root.render(
                <RungTable
                    label="Documented ladder for Main copy"
                    rungs={[
                        {
                            cappedByText: ['Capped by the daily loss limit.'],
                            risk: 250,
                            runningLossAfter: 250,
                            takeProfit: 500,
                        },
                        {
                            cappedByText: [],
                            risk: 100,
                            runningLossAfter: 350,
                            takeProfit: 200,
                        },
                    ]}
                />,
            );
        });

        expect(container.querySelector('caption')?.textContent).toBe(
            'Documented ladder for Main copy',
        );
        expect(
            [...container.querySelectorAll('th')].map(
                (cell) => cell.textContent,
            ),
        ).toEqual([
            'Trade',
            'Risk',
            'Take profit',
            'Running loss after',
            'Capped by',
        ]);
        expect(
            [...container.querySelectorAll(':scope tbody tr')].map((row) =>
                [...row.querySelectorAll('td')].map((cell) => cell.textContent),
            ),
        ).toEqual([
            [
                '1',
                '$250.00',
                '$500.00',
                '$250.00',
                'Capped by the daily loss limit.',
            ],
            ['2', '$100.00', '$200.00', '$350.00', ''],
        ]);
    });

    it('joins several capping rules with one separator', () => {
        act(() => {
            root.render(
                <RungTable
                    label="ladder"
                    rungs={[
                        {
                            cappedByText: ['First rule.', 'Second rule.'],
                            risk: 100,
                            runningLossAfter: 100,
                            takeProfit: 200,
                        },
                    ]}
                />,
            );
        });

        expect(
            container.querySelector(':scope tbody td:last-child')?.textContent,
        ).toBe('First rule., Second rule.');
    });

    it('is the only rung table the copy group section draws', () => {
        const source = readFileSync(GROUP_SIZING_SECTION, 'utf8');

        expect(source).toContain('<RungTable');
        expect(source).not.toContain('<TableHead');
    });
});
