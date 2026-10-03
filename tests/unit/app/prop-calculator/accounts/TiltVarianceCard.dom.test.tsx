import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TiltVarianceCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { TiltVarianceCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/TiltVarianceCard';

function model(
    overrides: Partial<TiltVarianceCardModel> = {},
): TiltVarianceCardModel {
    return {
        disclosure: 'Not path-adjusted: a cash-basis estimate only.',
        droppedNote: null,
        rows: [
            {
                firm: 'Alpha Prop',
                key: 'alpha-2026-02',
                month: '2026-02',
                netCash: '$0.00',
                netWithoutViolations: '$200.00',
                violationCost: '$200.00',
            },
        ],
        ...overrides,
    };
}

describe('TiltVarianceCard', () => {
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

    it('shows a violation of a month with no cash as a row', () => {
        act(() => {
            root.render(<TiltVarianceCard model={model()} />);
        });
        expect(container.textContent).toContain('2026-02');
        expect(container.textContent).toContain('$200.00');
    });

    it('states how many violations the split dropped', () => {
        act(() => {
            root.render(
                <TiltVarianceCard
                    model={model({
                        droppedNote:
                            '1 recorded violation belongs to no listed account and is not in this split.',
                    })}
                />,
            );
        });
        expect(container.textContent).toContain(
            '1 recorded violation belongs to no listed account and is not in this split.',
        );
    });

    it('prints no dropped note when every violation is in the split', () => {
        act(() => {
            root.render(<TiltVarianceCard model={model()} />);
        });
        expect(container.textContent).not.toContain('belongs to no listed');
    });
});
