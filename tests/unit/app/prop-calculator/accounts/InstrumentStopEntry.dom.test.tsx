import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_ENTRY_INSTRUMENT,
    InstrumentStopEntry,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/InstrumentStopEntry';
import { InstrumentSymbol } from '~/lib/prop-calculator';

vi.mock('~/components/ui/Select', () => ({
    Select: ({
        children,
        onValueChange,
        value,
    }: {
        readonly children: ReactNode;
        readonly onValueChange: (value: string) => void;
        readonly value: string;
    }) => (
        <select
            data-testid="instrument"
            onChange={(event) => {
                onValueChange(event.target.value);
            }}
            value={value}
        >
            {children}
        </select>
    ),
    SelectContent: ({ children }: { readonly children: ReactNode }) => (
        <>{children}</>
    ),
    SelectItem: ({
        children,
        value,
    }: {
        readonly children: ReactNode;
        readonly value: string;
    }) => <option value={value}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
}));

describe('InstrumentStopEntry', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onInstrumentChange = vi.fn();
    const onStopInputChange = vi.fn();

    function render() {
        act(() => {
            root.render(
                <InstrumentStopEntry
                    instrument={DEFAULT_ENTRY_INSTRUMENT}
                    instrumentId="entry-instrument"
                    onInstrumentChange={onInstrumentChange}
                    onStopInputChange={onStopInputChange}
                    stopId="entry-stop"
                    stopInput="12"
                >
                    <span>extra</span>
                </InstrumentStopEntry>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        onInstrumentChange.mockReset();
        onStopInputChange.mockReset();
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

    it('defaults to NQ and shows the stop it was given and its children', () => {
        render();

        expect(DEFAULT_ENTRY_INSTRUMENT).toBe(InstrumentSymbol.NQ);
        expect(
            container.querySelector<HTMLInputElement>('#entry-stop')?.value,
        ).toBe('12');
        expect(container.textContent).toContain('extra');
    });

    it('reports a changed instrument as the typed symbol', () => {
        render();
        const select = container.querySelector<HTMLSelectElement>(
            '[data-testid="instrument"]',
        );
        if (select === null) throw new Error('no instrument select');

        act(() => {
            select.value = InstrumentSymbol.MNQ;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(onInstrumentChange).toHaveBeenCalledExactlyOnceWith(
            InstrumentSymbol.MNQ,
        );
    });

    it('ignores a value that is not an instrument', () => {
        render();
        const select = container.querySelector<HTMLSelectElement>(
            '[data-testid="instrument"]',
        );
        if (select === null) throw new Error('no instrument select');
        const option = document.createElement('option');
        option.value = 'NOT-AN-INSTRUMENT';
        select.append(option);

        act(() => {
            select.value = 'NOT-AN-INSTRUMENT';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(onInstrumentChange).not.toHaveBeenCalled();
    });

    it('reports the typed stop text', () => {
        render();
        const input = container.querySelector<HTMLInputElement>('#entry-stop');
        if (input === null) throw new Error('no stop input');

        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, '7.5');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(onStopInputChange).toHaveBeenCalledExactlyOnceWith('7.5');
    });
});
