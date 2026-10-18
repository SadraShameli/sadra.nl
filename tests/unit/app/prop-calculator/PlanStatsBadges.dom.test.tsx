import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PlanStatsBadges from '~/app/(app)/prop-calculator/_components/PlanStatsBadges';
import {
    formatPtdd,
    PtddBench,
} from '~/app/(app)/prop-calculator/_components/ptddBench';
import {
    ALL_FIRMS,
    dollars,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';

const COLOUR_CODING_CLASS =
    /(?:text|bg|border)-(?:success|warning|destructive|danger)/;

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

const GRADED_PTDD_RATIOS: readonly { bench: PtddBench; ratio: number }[] = [
    { bench: PtddBench.Hard, ratio: 3 },
    { bench: PtddBench.Demanding, ratio: 1.75 },
    { bench: PtddBench.Typical, ratio: 1.25 },
    { bench: PtddBench.Easy, ratio: 0.8 },
];

function hardDailyLossPlan(): Plan {
    const hardPlans = ALL_PLANS.filter((plan) =>
        plan.isDailyLossLimitTerminating(TradingPhase.Funded),
    );
    const plan = hardPlans.at(0);
    if (plan === undefined) throw new Error('no plan with a hard daily loss');
    return plan;
}

describe('PlanStatsBadges lays the plan rules out as a definition list (F009)', () => {
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
        vi.unstubAllGlobals();
    });

    function render(plan: Plan): void {
        act(() => {
            root.render(<PlanStatsBadges plan={plan} />);
        });
    }

    function chipRow(): Element | null {
        return container.querySelector(
            ':scope .app-prop-calculator__plan-stats-badges > div:not(.app-detail-list)',
        );
    }

    function detailValue(label: string): Element | null | undefined {
        return [
            ...container.querySelectorAll(':scope .app-detail-list dt'),
        ].find((term) => term.textContent === label)?.nextElementSibling;
    }

    it('lists every plan rule as a label and value pair in the shared definition list, for every plan', () => {
        for (const plan of ALL_PLANS) {
            render(plan);
            const terms = [
                ...container.querySelectorAll(':scope .app-detail-list dt'),
            ];
            const labels = terms.map((term) => term.textContent);
            expect(labels).toContain('PT:DD');
            expect(labels).toContain('Drawdown');
            for (const term of terms) {
                expect(term.nextElementSibling?.tagName).toBe('DD');
            }
            expect(chipRow()?.children).toHaveLength(terms.length);
        }
    });

    it('shows the definition list in a narrow container and the one-line chips only when the container has room', () => {
        render(hardDailyLossPlan());
        const wrapper = container.querySelector(
            ':scope .app-prop-calculator__plan-stats-badges',
        );
        expect(wrapper?.classList.contains('@container')).toBe(true);
        expect(
            container
                .querySelector(':scope .app-detail-list')
                ?.classList.contains('@2xl:hidden'),
        ).toBe(true);
        expect(chipRow()?.classList.contains('@max-2xl:hidden')).toBe(true);
    });

    it('states a hard daily loss limit in words in the default ink, never in a loss colour', () => {
        render(hardDailyLossPlan());
        expect(detailValue('Daily loss')?.textContent).toContain(
            '(hard, ends account)',
        );
        expect(container.getHTML()).not.toMatch(COLOUR_CODING_CLASS);
    });

    it('grades the PT:DD ratio in words beside the figure, so a hard target still reads as hard without colour', () => {
        const base = hardDailyLossPlan();
        for (const { bench, ratio } of GRADED_PTDD_RATIOS) {
            render(
                base.withOverrides({
                    profitTarget: dollars(base.drawdown.amount * ratio),
                }),
            );
            const graded = `${formatPtdd(ratio)} (${bench})`;
            expect(detailValue('PT:DD')?.textContent).toBe(graded);
            expect(chipRow()?.textContent).toContain(`PT:DD${graded}`);
        }
    });

    it('shows the PT:DD ratio in the default ink whatever its size', () => {
        for (const plan of ALL_PLANS) {
            render(plan);
            expect(detailValue('PT:DD')?.getHTML()).not.toMatch(
                COLOUR_CODING_CLASS,
            );
            expect(chipRow()?.getHTML()).not.toMatch(COLOUR_CODING_CLASS);
        }
    });
});
