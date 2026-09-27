import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

import AccountsPassedDistributionChart from '~/app/(app)/prop-calculator/_components/AccountsPassedDistributionChart';

describe('AccountsPassedDistributionChart caption prop (PT-61b)', () => {
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
        container.remove();
    });

    it('defaults the axis caption to "# accounts passed" when no caption is given', () => {
        act(() => {
            root.render(
                <AccountsPassedDistributionChart
                    distribution={[0.5, 0.3, 0.2]}
                />,
            );
        });
        expect(container.textContent).toContain('# accounts passed');
    });

    it('shows the given caption instead, for a payouts-per-funded-account distribution', () => {
        act(() => {
            root.render(
                <AccountsPassedDistributionChart
                    caption="# payouts per funded account"
                    distribution={[0.4, 0.35, 0.25]}
                />,
            );
        });
        expect(container.textContent).toContain(
            '# payouts per funded account',
        );
        expect(container.textContent).not.toContain('# accounts passed');
    });
});
