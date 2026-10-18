import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExposureCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/ExposureCard';
import {
    type ExposureCardModel,
    type ReadinessBoardCardModel,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { ReadinessBoardCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/ReadinessBoardCard';

import { withInfoTexts } from '../infoPopover';

type UnavailableRow = ExposureCardModel['unavailable'][number];

const LEDGER_ONLY_REASON =
    'it is a ledger-only account with no state to reconstruct';

const NO_SNAPSHOT_REASON = 'it has no snapshot yet';

function exposure(unavailable: readonly UnavailableRow[]): ExposureCardModel {
    return {
        accounts: [],
        disclosures: ['Exposure compares risk with cushion.'],
        groups: [],
        unavailable,
    };
}

function ledgerOnly(): UnavailableRow {
    return {
        account: 'Hola',
        isAwaitingSnapshot: false,
        key: 'hola',
        reason: LEDGER_ONLY_REASON,
    };
}

function readiness(
    unavailable: readonly UnavailableRow[],
): ReadinessBoardCardModel {
    return {
        disclosure: 'Eligible means the documented request can be made now.',
        notFundedCount: 0,
        rows: [],
        unavailable,
    };
}

function unsnapshotted(): UnavailableRow {
    return {
        account: 'Alpha',
        isAwaitingSnapshot: true,
        key: 'alpha',
        reason: NO_SNAPSHOT_REASON,
    };
}

describe('board cards whose every account is unavailable', () => {
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

    function bodyRows(): readonly Element[] {
        return [...container.querySelectorAll(':scope tbody tr')];
    }

    function rowText(index: number): string {
        const row = bodyRows()[index];
        return row === undefined ? '' : withInfoTexts(row);
    }

    it('lists each account without an exposure with its reason when a balance would not fix it', () => {
        act(() => {
            root.render(
                <ExposureCard
                    model={exposure([ledgerOnly(), unsnapshotted()])}
                />,
            );
        });
        expect(container.textContent).not.toContain('Enter balances');
        expect(bodyRows()).toHaveLength(2);
        expect(rowText(0)).toContain(
            'It is a ledger-only account with no state to reconstruct.',
        );
        expect(rowText(1)).toContain('It has no snapshot yet.');
    });

    it('asks for balances on the exposure card when every account only lacks a snapshot', () => {
        act(() => {
            root.render(<ExposureCard model={exposure([unsnapshotted()])} />);
        });
        expect(container.textContent).toContain(
            'Enter balances to see your exposure',
        );
        expect(container.querySelector('table')).toBeNull();
    });

    it('lists each funded account without payout readiness with its reason when a balance would not fix it', () => {
        act(() => {
            root.render(
                <ReadinessBoardCard model={readiness([ledgerOnly()])} />,
            );
        });
        expect(container.textContent).not.toContain('Enter balances');
        expect(bodyRows()).toHaveLength(1);
        expect(rowText(0)).toContain('Hola');
        expect(rowText(0)).toContain(
            'It is a ledger-only account with no state to reconstruct.',
        );
    });

    it('asks for balances on payout readiness when every funded account only lacks a snapshot, and says no funded account when there is none', () => {
        act(() => {
            root.render(
                <ReadinessBoardCard model={readiness([unsnapshotted()])} />,
            );
        });
        expect(container.textContent).toContain(
            'Enter balances to see payout readiness',
        );
        expect(container.querySelector('table')).toBeNull();
        act(() => {
            root.render(<ReadinessBoardCard model={readiness([])} />);
        });
        expect(container.textContent).toContain(
            'No funded account to check yet',
        );
        expect(container.textContent).not.toContain('Enter balances');
    });
});
