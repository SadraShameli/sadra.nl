import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveRulesCardKind } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { LiveRulesCard } from '~/app/(app)/prop-calculator/accounts/_components/detail/LiveRulesCard';
import { contracts, DrawdownKind, fraction } from '~/lib/prop-calculator';

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

    it('names the drawdown kind in words, as the plan rules do', () => {
        act(() => {
            root.render(
                <LiveRulesCard
                    view={{
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
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('$3,000 EOD trailing');
        expect(container.textContent).not.toContain('eod-trailing');
    });
});
