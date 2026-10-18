import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TradingInputs from '~/app/(app)/prop-calculator/_components/TradingInputs';
import { InstrumentSymbol } from '~/lib/prop-calculator';

import { infoText } from './infoPopover';
import { tradingInputsProperties } from './tradingInputsFixture';

const PAIRED_FIELD_IDS = [
    ['trades-per-day', 'commission'],
    ['max-attempts', 'copy-accounts'],
    ['position-sizing-instrument', 'position-sizing-stop'],
] as const;

describe('TradingInputs on a phone', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <TradingInputs
                    {...tradingInputsProperties({
                        instrument: InstrumentSymbol.MNQ,
                        stopPoints: 10,
                    })}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function gridOf(id: string): Element {
        const grid = container
            .querySelector(`#${CSS.escape(id)}`)
            ?.closest('.grid');
        if (grid === null || grid === undefined) {
            throw new Error(`no grid around ${id}`);
        }
        return grid;
    }

    it('stacks each pair of fields in one column below md and pairs them from md', () => {
        for (const [first, second] of PAIRED_FIELD_IDS) {
            const grid = gridOf(first);
            expect(gridOf(second)).toBe(grid);
            expect(grid.classList.contains('grid-cols-2')).toBe(false);
            expect(grid.classList.contains('md:grid-cols-2')).toBe(true);
        }
    });

    it('keeps the commission label short and puts the round trip detail behind its info button', () => {
        expect(
            container.querySelector('label[for="commission"]')?.textContent,
        ).toBe('Commission ($)');
        expect(infoText(container, 'Commission ($)')).toContain(
            'Round-trip commission',
        );
    });
});
