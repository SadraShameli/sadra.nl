import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    LiveRulesCardKind,
    type LiveRulesCardView,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { LiveRulesCard } from '~/app/(app)/prop-calculator/accounts/_components/detail/LiveRulesCard';
import { contracts, DrawdownKind, fraction } from '~/lib/prop-calculator';

import { detailListEntries } from './detailListEntries';

const MODELED: LiveRulesCardView = {
    contractLimit: {
        micros: contracts(100),
        minis: contracts(10),
    },
    cushionPercent: fraction(0.1),
    dailyLossLimit: null,
    drawdown: {
        amount: 3000,
        kind: DrawdownKind.EodTrailing,
    },
    isApproximation: false,
    kind: LiveRulesCardKind.Modeled,
    minPayoutRequest: 500,
    requiresLockForWithdrawal: true,
};

describe('LiveRulesCard', () => {
    let container: HTMLElement;
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
        container.remove();
        vi.unstubAllGlobals();
    });

    function renderModeled() {
        act(() => {
            root.render(<LiveRulesCard view={MODELED} />);
        });
    }

    it('names the drawdown kind in words, as the plan rules do', () => {
        renderModeled();
        expect(container.textContent).toContain('$3,000 EOD trailing');
        expect(container.textContent).not.toContain('eod-trailing');
    });

    it('lists every live rule as a label beside its own value', () => {
        renderModeled();
        expect(detailListEntries(container)).toStrictEqual([
            ['Drawdown', '$3,000 EOD trailing'],
            ['Daily loss limit', '–Not available'],
            ['Cushion percent', '10%'],
            ['Requires lock for withdrawal', 'yes'],
            ['Minimum payout request', '$500'],
            ['Contract limit', '10 minis / 100 micros'],
        ]);
    });
});
