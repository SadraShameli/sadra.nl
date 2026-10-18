import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({
        useDebouncedComputation: (
            _id: unknown,
            _key: unknown,
            _debounceMs: unknown,
            compute: () => unknown,
        ) => ({
            error: null,
            pending: false,
            result: compute(),
        }),
    }),
);

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import SensitivityHeatmap from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';

const COMPACT_MULTIPLIER: Readonly<Record<string, number>> = {
    '': 1,
    K: 1000,
    M: 1_000_000,
};

function parseCompactCurrency(text: string): number {
    const match = /^(-?)\$([\d,.]+)([KM]?)$/.exec(text);
    if (!match) throw new Error(`not a compact currency: ${text}`);
    const [, sign = '', digits = '', suffix = ''] = match;
    const magnitude =
        Number(digits.replaceAll(',', '')) * (COMPACT_MULTIPLIER[suffix] ?? 1);
    return sign === '-' ? -magnitude : magnitude;
}

function parseTileValue(text: string): number {
    return text.endsWith('%')
        ? Number(text.slice(0, -1))
        : parseCompactCurrency(text);
}

describe('SensitivityHeatmap shows an EV-per-attempt metric (F-V9, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function legendEnds(metric: string): string[] {
        return [
            ...container.querySelectorAll(
                `:scope .app-prop-calculator__sensitivity-${metric} [data-heat-legend-end]`,
            ),
        ].map((end) => end.textContent);
    }

    function renderHeatmap(): void {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
    }

    function tilesOf(metric: string): HTMLElement[] {
        return [
            ...container.querySelectorAll<HTMLElement>(
                `:scope .app-prop-calculator__sensitivity-${metric} [data-heat-step]`,
            ),
        ];
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
    });

    it('renders a fourth card titled with EV per attempt, labelled per attempt', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        expect(container.textContent).toContain('EV per attempt sensitivity');
        expect(container.textContent).toContain('per attempt');
    });

    it('labels both ends of a camel scale legend on every card, never red or green', () => {
        renderHeatmap();
        expect(container.textContent).not.toMatch(/\b(red|green)\b/i);
        expect(legendEnds('eval-pass')).toEqual(['0%', '100%']);
        expect(legendEnds('funded-survive')).toEqual(['0%', '100%']);
        for (const metric of ['net', 'ev-per-attempt']) {
            const [low, high] = legendEnds(metric);
            expect(low).toMatch(/\$/);
            expect(high).toMatch(/\$/);
            expect(parseCompactCurrency(low ?? '')).toBeLessThan(
                parseCompactCurrency(high ?? ''),
            );
        }
    });

    it('raises the tile strength with the value in every grid, from near the card to camel', () => {
        renderHeatmap();
        for (const metric of [
            'eval-pass',
            'funded-survive',
            'net',
            'ev-per-attempt',
        ]) {
            const tiles = tilesOf(metric)
                .map((tile) => ({
                    step: Number(tile.dataset.heatStep),
                    value: parseTileValue(tile.textContent),
                }))
                .toSorted((a, b) => a.value - b.value || a.step - b.step);
            expect(tiles).toHaveLength(49);
            for (let index = 1; index < tiles.length; index++) {
                expect(tiles[index]?.step).toBeGreaterThanOrEqual(
                    tiles[index - 1]?.step ?? Infinity,
                );
            }
            expect(tiles.at(0)?.step).toBe(0);
        }
    });

    it('draws every tile in the default ink on a camel step, never a status colour', () => {
        renderHeatmap();
        expect(tilesOf('net')).toHaveLength(49);
        for (const tile of tilesOf('net')) {
            expect(tile.className).toContain('text-ink');
            expect(tile.className).toContain('var(--camel)');
            expect(tile.className).not.toMatch(
                /success|warning|destructive|danger/,
            );
        }
    });

    it('keeps each heatmap a scrolling winrate by RR grid on phone, never stacked cards', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        expect(container.querySelector('[data-label]')).toBeNull();
        const firstTable = container.querySelector(':scope table');
        expect(
            [...(firstTable?.querySelectorAll(':scope thead th') ?? [])].map(
                (header) => header.textContent,
            ),
        ).toEqual([
            'WR ↓ RR →',
            '1:1',
            '1.5:1',
            '2:1',
            '2.5:1',
            '3:1',
            '3.5:1',
            '4:1',
        ]);
        expect(
            firstTable?.querySelectorAll(':scope tbody th[scope="row"]'),
        ).toHaveLength(7);
    });

    it('pins a narrow winrate column on phone so the RR columns scroll beside it', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        const tables = [...container.querySelectorAll('table')];
        expect(tables).toHaveLength(4);
        for (const table of tables) {
            for (const token of [
                'max-md:[&_tr>*:first-child]:sticky',
                'max-md:[&_tr>*:first-child]:left-0',
                'max-md:[&_tr>*:first-child]:bg-background',
                'max-md:[&_td]:px-1',
            ]) {
                expect(table.classList.contains(token)).toBe(true);
            }
        }
    });
});
