import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorProvider,
    useCalculatorActions,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    CalculatorActionType,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { readLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

interface Harness {
    availableCents: null | number;
    pathname: string;
    rulebook: null | RulebookParameters;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    availableCents: null,
    pathname: '/',
    rulebook: null,
    userId: null,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => harness.pathname,
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
                    }),
                },
            },
            rulebook: {
                get: {
                    useQuery: () => ({ data: harness.rulebook ?? undefined }),
                },
            },
        },
    },
}));

const SWITCH_CENTS = 500_000;

function belowThreshold(): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            objectiveSwitchCents: SWITCH_CENTS,
        },
    };
}

function objectiveInAddressBar(): null | string {
    return new URLSearchParams(window.location.search).get('obj');
}

function objectiveInLastToolQuery(): null | string {
    return new URLSearchParams(readLastToolQuery() ?? '').get('obj');
}

function Probe() {
    const { encodeOptions, state } = useCalculatorInputs();
    const { applyState, dispatch, reset } = useCalculatorActions();
    return (
        <>
            <output data-testid="objective">{state.objective}</output>
            <output data-testid="url-mode">{encodeOptions.objectiveUrl}</output>
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
            <button
                data-testid="apply-monthly"
                onClick={() => applyState(defaultCalculatorState())}
                type="button"
            />
            <button
                data-testid="choose-monthly"
                onClick={() =>
                    dispatch({
                        objective: SizingObjective.MonthlyNet,
                        type: CalculatorActionType.SetObjective,
                    })
                }
                type="button"
            />
        </>
    );
}

describe('an explicit MonthlyNet pick survives (PT-63c, F-V15)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function shown(): null | string {
        return (
            container.querySelector('[data-testid="objective"]')?.textContent ??
            null
        );
    }

    function open(search: string) {
        window.history.replaceState(null, '', `${harness.pathname}${search}`);
        act(() => {
            root.render(
                <CalculatorProvider>
                    <Probe />
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

    function urlMode(): null | string {
        return (
            container.querySelector('[data-testid="url-mode"]')?.textContent ??
            null
        );
    }

    function chooseMonthly() {
        act(() => {
            container
                .querySelector<HTMLButtonElement>(
                    '[data-testid="choose-monthly"]',
                )
                ?.click();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sessionStorage.clear();
        harness.availableCents = null;
        harness.pathname = routes.propCalculator.analysis;
        harness.rulebook = null;
        harness.userId = 'user-1';
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

    it('writes obj=monthly-net into the address bar when the user picks MonthlyNet below the threshold', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        chooseMonthly();
        expect(shown()).toBe(SizingObjective.MonthlyNet);
        expect(new URLSearchParams(window.location.search).get('obj')).toBe(
            SizingObjective.MonthlyNet,
        );
    });

    it('keeps the pick for the last-tool restore', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        chooseMonthly();
        expect(new URLSearchParams(readLastToolQuery() ?? '').get('obj')).toBe(
            SizingObjective.MonthlyNet,
        );
    });

    it('keeps MonthlyNet on reload, opening the saved URL below the threshold', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        chooseMonthly();
        const saved = window.location.search;
        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        open(saved);
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('keeps MonthlyNet when the user picks it before the bankroll arrives', () => {
        harness.rulebook = belowThreshold();
        open('');
        chooseMonthly();
        harness.availableCents = 100_000;
        open(window.location.search);
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('does not write obj for a signed-out visitor who never chose', () => {
        harness.userId = null;
        open('');
        expect(new URLSearchParams(window.location.search).has('obj')).toBe(
            false,
        );
    });

    it('does not write an automatically chosen objective into the address bar or the last-tool query', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(objectiveInAddressBar()).toBeNull();
        expect(objectiveInLastToolQuery()).toBeNull();
        expect(urlMode()).toBe('omitted');
    });

    it('re-evaluates after a reload: an automatic pick does not stay pinned once the bankroll passes the threshold', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        const saved = window.location.search;
        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        harness.availableCents = 900_000;
        open(saved);
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('picks the automatic objective again on a reload that is still below the threshold', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        const saved = window.location.search;
        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        open(saved);
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(urlMode()).toBe('omitted');
    });

    it('runs the automatic objective again on reset after an automatic pick, pinning nothing', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        click('reset');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(urlMode()).toBe('omitted');
        expect(objectiveInAddressBar()).toBeNull();
        expect(objectiveInLastToolQuery()).toBeNull();
    });

    it('does not keep a chosen MonthlyNet pinned in the URL after reset, which runs the automatic objective as a reload does', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        chooseMonthly();
        expect(objectiveInAddressBar()).toBe(SizingObjective.MonthlyNet);
        click('reset');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(urlMode()).toBe('omitted');
        expect(objectiveInAddressBar()).toBeNull();
        expect(objectiveInLastToolQuery()).toBeNull();
    });

    it('goes back to the natural MonthlyNet on reset when nothing was chosen automatically', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 900_000;
        open('');
        chooseMonthly();
        expect(objectiveInAddressBar()).toBe(SizingObjective.MonthlyNet);
        click('reset');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
        expect(urlMode()).toBe('natural');
        expect(objectiveInAddressBar()).toBeNull();
        expect(objectiveInLastToolQuery()).toBeNull();
    });

    it('treats an applied state with another objective as a chosen one after an automatic pick', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        click('apply-cycle');
        expect(shown()).toBe(SizingObjective.CycleCash);
        expect(urlMode()).toBe('explicit');
        expect(objectiveInAddressBar()).toBe(SizingObjective.CycleCash);
    });

    it('keeps a MonthlyNet applied over an automatic RuinFirst explicit', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        click('apply-monthly');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
        expect(urlMode()).toBe('explicit');
        expect(objectiveInAddressBar()).toBe(SizingObjective.MonthlyNet);
    });

    it('keeps an automatic pick automatic when the applied state carries the same objective', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        open('');
        click('apply-ruin');
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(urlMode()).toBe('omitted');
    });

    it('does not let an obj value that is not an objective suppress the automatic choice', () => {
        harness.rulebook = belowThreshold();
        harness.availableCents = 100_000;
        const garbage = `?${encodeState(defaultCalculatorState()).toString()}&obj=foo`;
        open(garbage);
        expect(shown()).toBe(SizingObjective.RuinFirst);
        expect(objectiveInAddressBar()).toBeNull();
    });

    it('does not pin MonthlyNet for a link whose obj value is not an objective', () => {
        harness.userId = null;
        const garbage = `?${encodeState(defaultCalculatorState()).toString()}&obj=foo`;
        open(garbage);
        expect(shown()).toBe(SizingObjective.MonthlyNet);
        expect(urlMode()).toBe('natural');
        expect(objectiveInAddressBar()).toBeNull();
    });

    it('exposes the explicit url mode for a link that carries its objective', () => {
        harness.userId = null;
        const link = `?${encodeState({
            ...defaultCalculatorState(),
            objective: SizingObjective.CycleCash,
        }).toString()}`;
        open(link);
        expect(shown()).toBe(SizingObjective.CycleCash);
        expect(urlMode()).toBe('explicit');
    });

    it('exposes the natural url mode for a visitor who never chose', () => {
        harness.userId = null;
        open('');
        expect(urlMode()).toBe('natural');
    });

    it('exposes the explicit url mode after the user picks MonthlyNet', () => {
        harness.userId = null;
        open('');
        chooseMonthly();
        expect(urlMode()).toBe('explicit');
    });
});
