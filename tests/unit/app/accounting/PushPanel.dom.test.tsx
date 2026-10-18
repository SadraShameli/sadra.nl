import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '~/lib/accounting/core/types';

import { PushPanel } from '~/app/(app)/accounting/_components/PushPanel';
import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId, RunId } from '~/lib/accounting/core/ids';

const stream = vi.hoisted(() => ({ running: false }));

vi.mock('~/trpc/react', () => ({
    api: {
        accounting: {
            runs: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('~/app/(app)/accounting/_components/useImportStream', () => ({
    useImportStream: () => ({
        abort: vi.fn(),
        error: null,
        events: [],
        reset: vi.fn(),
        running: stream.running,
        start: vi.fn(),
    }),
}));

function booking(txnId: string): Booking {
    return {
        amountEur: 12,
        bank: { id: LedgerId('1'), label: 'Wise EUR' },
        counterpartLedger: { id: LedgerId('99'), label: 'Software' },
        counterpartName: 'Anthropic Ireland',
        date: isoDateSchema.parse('2026-10-01'),
        direction: 'OUT',
        notes: [],
        sourceCurrency: currencyCodeSchema.parse('EUR'),
        taxCode: 'BI_EU_INK',
        txnId,
    };
}

const mounted: { container: HTMLDivElement; root: Root }[] = [];

function render(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    act(() => {
        root.render(
            <PushPanel
                accountingCredentialId="credential"
                bookings={[booking('card-1'), booking('card-2')]}
                onCompleted={vi.fn()}
                runId={RunId('run')}
                targetLabel="eBoekhouden"
            />,
        );
    });
    return container;
}

function spinnersIn(container: HTMLElement): number {
    return container.querySelectorAll('[role="status"]').length;
}

describe('the push panel booking rows', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        stream.running = false;
        vi.unstubAllGlobals();
    });

    it('shows no spinner on bookings that are waiting to be posted', () => {
        expect(spinnersIn(render())).toBe(0);
    });

    it('spins the waiting bookings while a push is running', () => {
        stream.running = true;
        expect(spinnersIn(render())).toBeGreaterThanOrEqual(2);
    });
});
