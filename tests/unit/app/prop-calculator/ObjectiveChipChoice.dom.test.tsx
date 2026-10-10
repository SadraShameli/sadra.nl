import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorProvider,
    useCalculatorActions,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { CalculatorObjectiveChip } from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';

interface Harness {
    availableCents: null | number;
    isRulebookFailed: boolean;
    isSummaryFailed: boolean;
    rulebook: null | RulebookParameters;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    availableCents: null,
    isRulebookFailed: false,
    isSummaryFailed: false,
    rulebook: null,
    userId: null,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: {
                    useQuery: () => ({
                        data:
                            harness.availableCents === null
                                ? undefined
                                : { availableCents: harness.availableCents },
                        isError: harness.isSummaryFailed,
                    }),
                },
            },
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: harness.rulebook ?? undefined,
                        isError: harness.isRulebookFailed,
                    }),
                },
            },
        },
    },
}));

function StateControls() {
    const { applyState, reset } = useCalculatorActions();
    return (
        <>
            <button data-testid="reset" onClick={reset} type="button" />
            <button
                data-testid="apply-cycle"
                onClick={() =>
                    applyState({
                        ...defaultCalculatorState(),
                        objective: SizingObjective.CycleCash,
                    })
                }
                type="button"
            />
            <button
                data-testid="apply-ruin"
                onClick={() =>
                    applyState({
                        ...defaultCalculatorState(),
                        objective: SizingObjective.RuinFirst,
                    })
                }
                type="button"
            />
        </>
    );
}

function withSwitch(): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            objectiveSwitchCents: 500_000,
        },
    };
}

describe('the objective chip says how the objective was chosen (PT-63c, F-V15)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function open(search = '') {
        window.history.replaceState(null, '', `/${search}`);
        act(() => {
            root.render(
                <CalculatorProvider>
                    <CalculatorObjectiveChip />
                    <StateControls />
                </CalculatorProvider>,
            );
        });
    }

    function click(testId: string) {
        act(() => {
            container
                .querySelector<HTMLButtonElement>(
                    `[data-testid="${CSS.escape(testId)}"]`,
                )
                ?.click();
        });
    }

    function pick(objective: SizingObjective) {
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Ranking objective"]',
        );
        if (select === null) throw new Error('select missing');
        act(() => {
            select.value = objective;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sessionStorage.clear();
        harness.availableCents = null;
        harness.isRulebookFailed = false;
        harness.isSummaryFailed = false;
        harness.rulebook = null;
        harness.userId = null;
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

    it('names the bankroll and the threshold when the objective was chosen automatically', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        const text = container.textContent;
        expect(text).toContain('Chosen automatically');
        expect(text).toContain('$1,000');
        expect(text).toContain('$5,000');
        expect(text).toContain('ruin first');
    });

    it('says ruin first ranks which plan to buy and that this page keeps sizing on monthly net', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        const text = container.textContent;
        expect(text).toContain('your bankroll selected ruin first');
        expect(text).toContain('which plan to buy');
        expect(text).toContain("this page's sizing stays on monthly net");
        expect(text).not.toMatch(/this page ranks by ruin first/i);
        expect(text).not.toMatch(/page ranks by ruin first/i);
    });

    it('keeps the automatic note after a reset, which runs the automatic objective again as a reload does', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        expect(container.textContent).toContain('Chosen automatically');
        click('reset');
        expect(container.textContent).toContain('Chosen automatically');
        expect(container.textContent).toContain('Objective: ruin first');
    });

    it('says the objective was chosen automatically after a reset that followed a link objective (PT-63e)', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open('?obj=cycle-cash');
        expect(container.textContent).not.toContain('Chosen automatically');
        click('reset');
        expect(container.textContent).toContain('Objective: ruin first');
        expect(container.textContent).toContain('Chosen automatically');
    });

    it('drops the automatic note when an applied state carries another objective', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        click('apply-cycle');
        expect(container.textContent).not.toContain('Chosen automatically');
        expect(container.textContent).toContain('Objective: cycle cash');
    });

    it('keeps the automatic note when an applied state carries the same objective', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        click('apply-ruin');
        expect(container.textContent).toContain('Chosen automatically');
    });

    it('drops the automatic note once the user picks an objective themselves', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        pick(SizingObjective.MonthlyNet);
        expect(container.textContent).not.toContain('Chosen automatically');
    });

    it('says nothing about automatic choice for a link that carries its objective', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open('?obj=cycle-cash');
        expect(container.textContent).not.toContain('Chosen automatically');
    });

    it('says nothing about automatic choice for a signed-out visitor', () => {
        harness.rulebook = withSwitch();
        harness.availableCents = 100_000;
        open();
        expect(container.textContent).not.toContain('Chosen automatically');
    });

    it('says the bankroll summary failed to load instead of staying silent', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch();
        harness.isSummaryFailed = true;
        open();
        expect(container.textContent).toContain('bankroll could not be loaded');
    });

    it('says the rulebook failed to load instead of staying silent', () => {
        harness.userId = 'user-1';
        harness.availableCents = 100_000;
        harness.isRulebookFailed = true;
        open();
        expect(container.textContent).toContain('rulebook could not be loaded');
    });

    it('does not report a failure for a signed-out visitor', () => {
        harness.isSummaryFailed = true;
        harness.isRulebookFailed = true;
        open();
        expect(container.textContent).not.toContain('could not be loaded');
    });

    it('does not report a failure once the link or the user fixed the objective', () => {
        harness.userId = 'user-1';
        harness.isSummaryFailed = true;
        open('?obj=cycle-cash');
        expect(container.textContent).not.toContain('could not be loaded');
    });
});
