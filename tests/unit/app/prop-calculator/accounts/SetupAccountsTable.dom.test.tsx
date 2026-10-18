import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type SetupAccountRow } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SetupAccountsTable } from '~/app/(app)/prop-calculator/accounts/_components/overview/SetupAccountsTable';
import { routes } from '~/lib/site/routes';

import { pickOption } from './pickOption';

function accountRow(
    index: number,
    note: null | string = null,
): SetupAccountRow {
    const id = `account-${String(index).padStart(2, '0')}`;
    return {
        firm: index % 2 === 0 ? 'Lucid Trading' : 'Tradeify',
        href: routes.propCalculator.accounts.detail(id),
        key: id,
        label: `Account ${String(index).padStart(2, '0')}`,
        note,
        plan: 'Pro 50K',
        purchasedOn: '2026-10-15',
        stage: 'Evaluation',
    };
}

describe('SetupAccountsTable', () => {
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

    function render(accounts: readonly SetupAccountRow[]) {
        act(() => {
            root.render(<SetupAccountsTable accounts={accounts} />);
        });
    }

    function headers(): readonly string[] {
        return [...container.querySelectorAll(':scope thead th')].map(
            (cell) => cell.textContent,
        );
    }

    function firstColumn(): readonly string[] {
        return [
            ...container.querySelectorAll(':scope tbody tr:not([aria-hidden])'),
        ].map((row) => row.querySelector(':scope > th')?.textContent ?? '');
    }

    function button(label: string): HTMLButtonElement {
        const found = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent.trim() === label,
        );
        if (found === undefined) throw new Error(`no ${label} button`);
        return found;
    }

    it('shows each account with its firm, plan, stage and purchase date, linked to the account', () => {
        render([accountRow(1)]);
        expect(headers()).toEqual([
            'Account',
            'Firm',
            'Plan',
            'Stage',
            'Purchased',
        ]);
        const row = container.querySelector(':scope tbody > tr');
        expect(row?.textContent).toContain('Tradeify');
        expect(row?.textContent).toContain('Pro 50K');
        expect(row?.textContent).toContain('Evaluation');
        expect(row?.textContent).toContain('15 Oct 2026');
        expect(row?.querySelector(':scope a')?.getAttribute('href')).toBe(
            routes.propCalculator.accounts.detail('account-01'),
        );
    });

    it('adds the balance column only when an account carries a balance note', () => {
        render([accountRow(1, 'No balance yet')]);
        expect(headers()).toContain('Balance');
        expect(container.textContent).toContain('No balance yet');
    });

    it('pages through many accounts 25 at a time and searches them', () => {
        render(Array.from({ length: 60 }, (_, index) => accountRow(index + 1)));
        expect(firstColumn()).toHaveLength(25);
        expect(container.textContent).toContain('1 to 25 of 60');
        act(() => {
            button('Next').click();
        });
        expect(firstColumn()[0]).toBe('Account 26');
        expect(container.textContent).toContain('26 to 50 of 60');
        expect(
            container.querySelector('input[placeholder="Search accounts"]'),
        ).not.toBeNull();
    });

    it('filters the rows by firm from a select above the table, with a way to clear it', async () => {
        render(Array.from({ length: 6 }, (_, index) => accountRow(index + 1)));
        expect(container.textContent).toContain('All firms');
        expect(container.textContent).toContain('All plans');
        expect(container.textContent).toContain('All stages');
        const firmTrigger = [
            ...container.querySelectorAll<HTMLElement>('[role="combobox"]'),
        ].find((candidate) => candidate.textContent.includes('All firms'));
        if (firmTrigger === undefined) throw new Error('no firm filter');
        await pickOption(firmTrigger, 'Tradeify (3)');
        expect(firstColumn()).toEqual([
            'Account 01',
            'Account 03',
            'Account 05',
        ]);
        expect(container.querySelectorAll(':scope tbody tr')).toHaveLength(6);
        act(() => {
            button('Clear filters').click();
        });
        expect(firstColumn()).toHaveLength(6);
    });

    it('sorts by a column header and says so to assistive technology', () => {
        render([accountRow(2), accountRow(1), accountRow(3)]);
        expect(firstColumn()).toEqual([
            'Account 01',
            'Account 02',
            'Account 03',
        ]);
        const accountHeader = container.querySelector('th');
        expect(accountHeader?.getAttribute('aria-sort')).toBe('ascending');
        act(() => {
            button('Account').click();
        });
        expect(firstColumn()).toEqual([
            'Account 03',
            'Account 02',
            'Account 01',
        ]);
        expect(accountHeader?.getAttribute('aria-sort')).toBe('descending');
    });
});
