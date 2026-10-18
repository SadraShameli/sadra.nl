import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TradingInputs, {
    PLAUSIBILITY_NOTE_ID,
} from '~/app/(app)/prop-calculator/_components/TradingInputs';

import { tradingInputsProperties } from './tradingInputsFixture';

const PLAUSIBILITY_WINRATE = 0.7;
const PLAUSIBILITY_RR = 1;
const INITIAL_TRADES_PER_DAY = 3;

interface HarnessProperties {
    onTradesPerDayChange?: (n: number) => void;
    tradesPerDayRef: { current: ((n: number) => void) | null };
}

function blur(id: string) {
    const input = field(id);
    act(() => {
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
}

function field(id: string): HTMLInputElement {
    const input = document.body.querySelector<HTMLInputElement>(`#${id}`);
    if (input === null) throw new Error(`no input ${id}`);
    return input;
}

function Harness({
    onTradesPerDayChange = vi.fn(),
    tradesPerDayRef,
}: HarnessProperties) {
    const [tradesPerDay, setTradesPerDay] = useState(INITIAL_TRADES_PER_DAY);
    tradesPerDayRef.current = setTradesPerDay;
    return (
        <TradingInputs
            {...tradingInputsProperties({
                onTradesPerDayChange: (n) => {
                    setTradesPerDay(n);
                    onTradesPerDayChange(n);
                },
                rrRatio: PLAUSIBILITY_RR,
                tradesPerDay,
                winrate: PLAUSIBILITY_WINRATE,
            })}
        />
    );
}

function note(): HTMLElement {
    const element = document.querySelector<HTMLElement>(
        `#${PLAUSIBILITY_NOTE_ID}`,
    );
    if (element === null) throw new Error('no plausibility note');
    return element;
}

function pressEnter(id: string) {
    const input = field(id);
    act(() => {
        input.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

function type(id: string, text: string) {
    const input = field(id);
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('TradingInputs plausibility note live region (F-V22, PT-86b)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let tradesPerDayRef: HarnessProperties['tradesPerDayRef'];

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        tradesPerDayRef = { current: null };
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function renderInputs(onTradesPerDayChange?: (n: number) => void) {
        act(() => {
            root.render(
                <Harness
                    onTradesPerDayChange={onTradesPerDayChange}
                    tradesPerDayRef={tradesPerDayRef}
                />,
            );
        });
    }

    it('is a polite status region that names the pace entered', () => {
        renderInputs();
        expect(note().getAttribute('role')).toBe('status');
        expect(note().textContent).toContain(
            `${INITIAL_TRADES_PER_DAY} trades per day`,
        );
    });

    it('names the note from both the trades per day and the compounding start fields', () => {
        renderInputs();
        expect(field('trades-per-day').getAttribute('aria-describedby')).toBe(
            PLAUSIBILITY_NOTE_ID,
        );
        expect(
            field('compounding-start').getAttribute('aria-describedby'),
        ).toBe(PLAUSIBILITY_NOTE_ID);
    });

    it('keeps the trades per day field live and the announced text unchanged while typing', () => {
        const onTradesPerDayChange = vi.fn();
        renderInputs(onTradesPerDayChange);
        const before = note().textContent;
        type('trades-per-day', '6');
        expect(onTradesPerDayChange).toHaveBeenLastCalledWith(6);
        expect(field('trades-per-day').value).toBe('6');
        expect(note().textContent).toBe(before);
        type('trades-per-day', '60');
        expect(note().textContent).toBe(before);
    });

    it('commits the pace into the note on blur', () => {
        renderInputs();
        type('trades-per-day', '6');
        blur('trades-per-day');
        expect(note().textContent).toContain('6 trades per day');
        expect(note().textContent).not.toContain(
            `${INITIAL_TRADES_PER_DAY} trades per day`,
        );
    });

    it('commits the pace into the note on Enter, then holds the next edit until it is committed', () => {
        renderInputs();
        type('trades-per-day', '7');
        pressEnter('trades-per-day');
        expect(note().textContent).toContain('7 trades per day');
        type('trades-per-day', '9');
        expect(note().textContent).toContain('7 trades per day');
        expect(note().textContent).not.toContain('9 trades per day');
        blur('trades-per-day');
        expect(note().textContent).toContain('9 trades per day');
    });

    it('follows a pace changed from outside the field at once', () => {
        renderInputs();
        act(() => {
            tradesPerDayRef.current?.(12);
        });
        expect(note().textContent).toContain('12 trades per day');
    });

    it('does not change the note while the compounding start is typed', () => {
        renderInputs();
        const before = note().textContent;
        type('compounding-start', '5000');
        expect(note().textContent).toBe(before);
    });

    it('commits the compounding start into the note on blur', () => {
        renderInputs();
        const before = note().textContent;
        type('compounding-start', '5000');
        blur('compounding-start');
        expect(note().textContent).not.toBe(before);
        expect(note().textContent).toContain('$5,000');
    });

    it('says more than 1,000x and drops the amount once the pace compounds past the cap', () => {
        renderInputs();
        type('compounding-start', '5000');
        blur('compounding-start');
        expect(note().textContent).toContain('$5,000');
        act(() => {
            tradesPerDayRef.current?.(4);
        });
        expect(note().textContent).toContain('compounds to more than 1,000x');
        expect(note().textContent).not.toContain('$5,000');
    });

    it('commits the compounding start into the note on Enter', () => {
        renderInputs();
        type('compounding-start', '2500');
        pressEnter('compounding-start');
        expect(note().textContent).toContain('$2,500');
    });
});
