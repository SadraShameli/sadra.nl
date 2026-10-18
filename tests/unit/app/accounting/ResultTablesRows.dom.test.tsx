import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking, ConversionResult } from '~/lib/accounting/core/types';

import {
    BookingsTable,
    UnknownsTable,
} from '~/app/(app)/accounting/_components/ResultTables';
import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';

import {
    dialogField,
    dialogTitled,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import { chooseRowAction } from '../../components/rowActionsMenu';

vi.mock('~/trpc/react', () => {
    const mutation = {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
    };
    return {
        api: {
            accounting: {
                rules: {
                    backtest: {
                        useQuery: () => ({
                            data: undefined,
                            isFetching: false,
                        }),
                    },
                    create: mutation,
                    update: mutation,
                },
                taxCodes: {
                    list: {
                        useQuery: () => ({
                            data: [{ code: 'BI_EU_INK', label: 'EU purchase' }],
                            isPending: false,
                        }),
                    },
                },
            },
            useUtils: () => ({
                accounting: { rules: { list: { invalidate: vi.fn() } } },
            }),
        },
    };
});

const SOFTWARE = { id: LedgerId('99'), label: 'Software' };

const BOOKING: Booking = {
    amountEur: 12,
    bank: { id: LedgerId('1'), label: 'Wise EUR' },
    counterpartLedger: SOFTWARE,
    counterpartName: 'Anthropic Ireland',
    date: isoDateSchema.parse('2026-10-01'),
    direction: 'OUT',
    notes: [],
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    taxCode: 'BI_EU_INK',
    txnId: 'card-1',
};

const RESULT: ConversionResult = {
    bookings: [BOOKING],
    matches: [],
    missingBankCurrencies: [],
    skippedCurrency: 0,
    skippedNoBank: 0,
    unknowns: [
        {
            count: 2,
            direction: 'IN',
            firstSeen: isoDateSchema.parse('2026-09-01'),
            lastSeen: isoDateSchema.parse('2026-10-01'),
            rawName: 'UNKNOWN SHOP',
        },
    ],
};

describe('the run result rows', () => {
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

    it('edits a booking from its row menu and hands back the patch', async () => {
        const onEdit = vi.fn();
        act(() => {
            root.render(
                <BookingsTable
                    bookings={[BOOKING]}
                    credentialId="books"
                    ledgerOptions={[SOFTWARE]}
                    onEdit={onEdit}
                    rules={[]}
                />,
            );
        });
        expect(
            container.querySelector(':scope tbody th[scope="row"]')
                ?.textContent,
        ).toBe('Anthropic Ireland');
        chooseRowAction('Anthropic Ireland booking card-1', 'Edit');
        dialogTitled('Edit booking');
        const counterpart = dialogField('Counterpart');
        expect(counterpart.value).toBe('Anthropic Ireland');
        typeInto(counterpart, 'Anthropic PBC');
        await submitDialog(
            'Save changes',
            () => new Promise((resolve) => setTimeout(resolve, 0)),
        );
        expect(onEdit).toHaveBeenCalledWith('card-1', {
            counterpartLedger: SOFTWARE,
            counterpartName: 'Anthropic PBC',
            direction: 'OUT',
            isRefund: false,
            taxCode: 'BI_EU_INK',
        });
    });

    it('keeps each conversion and reference in the row detail, read as a sentence with the fee on its own line', () => {
        act(() => {
            root.render(
                <BookingsTable
                    bookings={[
                        { ...BOOKING, notes: ['USD@ECB1.1188'] },
                        { ...BOOKING, notes: ['EUR+fee0.50'], txnId: 'card-2' },
                    ]}
                    credentialId="books"
                    ledgerOptions={[SOFTWARE]}
                    onEdit={vi.fn()}
                    rules={[]}
                />,
            );
        });
        expect(container.querySelector('tbody')?.textContent).not.toContain(
            'EUR, no conversion',
        );
        for (const expander of container.querySelectorAll<HTMLButtonElement>(
            ':scope tbody tr > td:first-child button',
        )) {
            act(() => {
                expander.click();
            });
        }
        const body = container.querySelector('tbody')?.textContent ?? '';
        expect(body).toContain('card-2');
        expect(body).toContain('USD → EUR at 1.1188 (ECB)');
        expect(body).toContain('EUR, no conversion');
        expect(body).toContain('Fee €0.50');
        expect(body).not.toContain('@ECB');
        expect(body).not.toContain('+fee');
    });

    it('starts a rule for an unknown counterpart from its row menu', () => {
        act(() => {
            root.render(
                <UnknownsTable
                    credentialId="books"
                    ledgerOptions={[SOFTWARE]}
                    result={RESULT}
                />,
            );
        });
        chooseRowAction('UNKNOWN SHOP', 'Create rule');
        const dialog = dialogTitled('New rule');
        expect(
            dialog.querySelector<HTMLInputElement>(
                ':scope input[placeholder="e.g. amazon"]',
            )?.value,
        ).toBe('UNKNOWN SHOP');
        expect(
            [...dialog.querySelectorAll(':scope [role="combobox"]')].map(
                (select) => select.textContent,
            ),
        ).toContain('In');
    });

    it('offers no row menu on unknowns when no rule can be created', () => {
        act(() => {
            root.render(<UnknownsTable result={RESULT} />);
        });
        expect(
            container.querySelector(':scope button[aria-label^="Actions for"]'),
        ).toBeNull();
    });
});
