import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    Booking,
    BookingDirection,
    ConversionResult,
} from '~/lib/accounting/core/types';

import { TotalPanel } from '~/app/(app)/accounting/_components/ResultTables';
import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';
import { Eur } from '~/lib/accounting/core/money';

vi.mock('~/trpc/react', () => ({ api: {} }));

function booking(
    txnId: string,
    direction: BookingDirection,
    amountEur: number,
): Booking {
    return {
        amountEur,
        bank: { id: LedgerId('1'), label: 'Wise EUR' },
        counterpartLedger: { id: LedgerId('99'), label: 'Software' },
        counterpartName: 'Anthropic Ireland',
        date: isoDateSchema.parse('2026-10-01'),
        direction,
        notes: [],
        sourceCurrency: currencyCodeSchema.parse('EUR'),
        taxCode: 'BI_EU_INK',
        txnId,
    };
}

const RESULT: ConversionResult = {
    bookings: [
        booking('in-1', 'IN', 30),
        booking('out-1', 'OUT', 7.5),
        booking('out-2', 'OUT', 4.5),
    ],
    matches: [],
    missingBankCurrencies: [],
    skippedCurrency: 0,
    skippedNoBank: 0,
    unknowns: [
        {
            count: 3,
            direction: 'OUT',
            firstSeen: isoDateSchema.parse('2026-09-01'),
            lastSeen: isoDateSchema.parse('2026-10-01'),
            rawName: 'UNKNOWN SHOP',
        },
    ],
};

const mounted: { container: HTMLDivElement; root: Root }[] = [];

function figureFor(container: HTMLElement, label: string): HTMLElement {
    const term = [...container.querySelectorAll('dt')].find(
        (dt) => dt.textContent === label,
    );
    const value = term?.nextElementSibling;
    if (!(value instanceof HTMLElement) || value.tagName !== 'DD') {
        throw new Error(`No figure labelled ${label}`);
    }
    return value;
}

function render(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    act(() => {
        root.render(<TotalPanel result={RESULT} />);
    });
    return container;
}

describe('the run totals strip', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        vi.unstubAllGlobals();
    });

    it('labels every total and shows the same figures the run produced', () => {
        const container = render();

        expect(figureFor(container, 'Bookings').textContent).toBe('3');
        expect(figureFor(container, 'In').textContent).toBe(Eur.format(30));
        expect(figureFor(container, 'Out').textContent).toBe(Eur.format(12));
        expect(figureFor(container, 'Unknown txns').textContent).toBe(
            '3 / 1 names',
        );
        expect(figureFor(container, 'Skipped currency').textContent).toBe('0');
    });

    it('flags unknown transactions as a warning and leaves an empty skip count plain', () => {
        const container = render();

        expect(
            figureFor(container, 'Unknown txns').classList.contains(
                'text-warning',
            ),
        ).toBe(true);
        expect(
            figureFor(container, 'Skipped currency').classList.contains(
                'text-warning',
            ),
        ).toBe(false);
    });
});
