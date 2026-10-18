import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ValueDetailLines } from '~/app/(app)/prop-calculator/accounts/_components/AccountValueCells';
import {
    type AccountValueColumns,
    EvPerAttemptKind,
    ExpectedPayoutsKind,
    NextPayoutKind,
} from '~/app/(app)/prop-calculator/accounts/_components/accountValueColumns';
import { AccountAction } from '~/lib/prop-calculator/advisor';

function pendingColumns(): AccountValueColumns {
    return {
        action: {
            action: AccountAction.EnterSnapshot,
            reason: null,
            text: 'Enter a snapshot',
        },
        atRisk: null,
        evPerAttempt: { kind: EvPerAttemptKind.Pending },
        expectedPayouts: { kind: ExpectedPayoutsKind.Pending },
        nextPayout: {
            days: null,
            isSoon: false,
            kind: NextPayoutKind.Pending,
            note: null,
            payingShare: null,
            text: 'Computing',
        },
    };
}

describe('ValueDetailLines', () => {
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

    it('keeps the computing placeholder of the EV per attempt line out of a paragraph, so the markup stays valid to hydrate', () => {
        act(() => {
            root.render(<ValueDetailLines columns={pendingColumns()} />);
        });
        expect(container.textContent).toContain('EV per attempt:');
        expect(
            container.querySelector('[data-slot="skeleton"]'),
        ).not.toBeNull();
        expect(container.querySelector(':scope p div')).toBeNull();
    });
});
