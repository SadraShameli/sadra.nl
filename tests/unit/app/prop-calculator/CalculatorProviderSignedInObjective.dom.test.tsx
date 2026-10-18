import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorProvider,
    type CalculatorProviderActions,
    useCalculatorActions,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';

interface Harness {
    availableCents: null | number;
    queryOptions: Record<string, unknown>;
    rulebook: null | RulebookParameters;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    availableCents: null,
    queryOptions: {},
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
                    useQuery: (
                        _input: unknown,
                        options: Record<string, unknown>,
                    ) => {
                        harness.queryOptions = options;
                        return {
                            data:
                                harness.availableCents === null
                                    ? undefined
                                    : {
                                          availableCents:
                                              harness.availableCents,
                                      },
                        };
                    },
                },
            },
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: harness.rulebook ?? undefined,
                    }),
                },
            },
        },
    },
}));

const SWITCH_CENTS = 500_000;

const probed: { actions: CalculatorProviderActions | null; query: string } = {
    actions: null,
    query: '',
};

function ObjectiveProbe() {
    const { encodeOptions, state } = useCalculatorInputs();
    probed.actions = useCalculatorActions();
    probed.query = JSON.stringify(encodeOptions);
    return <output data-testid="objective">{state.objective}</output>;
}

function reset() {
    act(() => {
        probed.actions?.reset();
    });
}

function withSwitch(objectiveSwitchCents: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        bankroll: { ...DEFAULT_RULEBOOK.bankroll, objectiveSwitchCents },
    };
}

describe('CalculatorProvider signed-in default objective (PT-63b, F-V15, QV-5)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function shown(): null | string {
        return (
            container.querySelector('[data-testid="objective"]')?.textContent ??
            null
        );
    }

    function open(search: string) {
        window.history.replaceState(null, '', `/${search}`);
        act(() => {
            root.render(
                <CalculatorProvider>
                    <ObjectiveProbe />
                </CalculatorProvider>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.availableCents = null;
        harness.queryOptions = {};
        harness.rulebook = null;
        harness.userId = null;
        probed.actions = null;
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

    it('opens a link without obj on RuinFirst for a signed-in user whose bankroll is below the threshold', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(SWITCH_CENTS);
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
    });

    it('reads the bankroll once: the summary query never goes stale or refetches on focus', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(SWITCH_CENTS);
        harness.availableCents = 100_000;
        open('');
        expect(harness.queryOptions).toMatchObject({
            enabled: true,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        });
    });

    it('keeps MonthlyNet at or above the threshold', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(SWITCH_CENTS);
        harness.availableCents = SWITCH_CENTS;
        open('');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('keeps MonthlyNet when the user set no threshold', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(null);
        harness.availableCents = 1;
        open('');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('keeps the objective a link carries, whatever the bankroll', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(SWITCH_CENTS);
        harness.availableCents = 100_000;
        open(
            `?${encodeState({
                ...defaultCalculatorState(),
                objective: SizingObjective.CycleCash,
            }).toString()}`,
        );
        expect(shown()).toBe(SizingObjective.CycleCash);
    });

    it('keeps MonthlyNet for a signed-out visitor', () => {
        harness.rulebook = withSwitch(SWITCH_CENTS);
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
    });

    it('waits for the bankroll before choosing', () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(SWITCH_CENTS);
        open('');
        expect(shown()).toBe(SizingObjective.MonthlyNet);
        harness.availableCents = 100_000;
        open('');
        expect(shown()).toBe(SizingObjective.RuinFirst);
    });

    describe('Reset (PT-63d, F-V15)', () => {
        it('runs the signed-in automatic objective again, so a reset and a reload agree', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open('');
            expect(shown()).toBe(SizingObjective.RuinFirst);
            reset();
            expect(shown()).toBe(SizingObjective.RuinFirst);
            expect(probed.query).toBe(
                JSON.stringify({ objectiveUrl: 'omitted' }),
            );
        });

        it('replaces an objective the user picked after the automatic one with the automatic one again', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open('');
            act(() => {
                probed.actions?.setObjective(SizingObjective.CycleCash);
            });
            expect(shown()).toBe(SizingObjective.CycleCash);
            reset();
            expect(shown()).toBe(SizingObjective.RuinFirst);
        });

        it('goes back to MonthlyNet when the bankroll chose nothing automatically', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = SWITCH_CENTS;
            open('');
            act(() => {
                probed.actions?.setObjective(SizingObjective.CycleCash);
            });
            reset();
            expect(shown()).toBe(SizingObjective.MonthlyNet);
        });

        it('goes back to MonthlyNet for a signed-out visitor', () => {
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open('');
            act(() => {
                probed.actions?.setObjective(SizingObjective.CycleCash);
            });
            reset();
            expect(shown()).toBe(SizingObjective.MonthlyNet);
        });
    });

    describe('Reset remembers the signed-in automatic objective without applying it (PT-63e, F-V15)', () => {
        const LINK_WITH_CYCLE_CASH = `?${encodeState({
            ...defaultCalculatorState(),
            objective: SizingObjective.CycleCash,
        }).toString()}`;

        it('gives RuinFirst on Reset after a link carried its own objective, as a reload without the link does', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open(LINK_WITH_CYCLE_CASH);
            expect(shown()).toBe(SizingObjective.CycleCash);
            reset();
            expect(shown()).toBe(SizingObjective.RuinFirst);
            expect(probed.query).toBe(
                JSON.stringify({ objectiveUrl: 'omitted' }),
            );
        });

        it('keeps the link objective when it opens, the remembered automatic one is never applied', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open(LINK_WITH_CYCLE_CASH);
            expect(shown()).toBe(SizingObjective.CycleCash);
            expect(probed.query).toBe(
                JSON.stringify({ objectiveUrl: 'explicit' }),
            );
        });

        it('gives RuinFirst on Reset after the user picked an objective before the bankroll arrived', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            open('');
            act(() => {
                probed.actions?.setObjective(SizingObjective.CycleCash);
            });
            harness.availableCents = 100_000;
            open('');
            expect(shown()).toBe(SizingObjective.CycleCash);
            reset();
            expect(shown()).toBe(SizingObjective.RuinFirst);
        });

        it('gives MonthlyNet on Reset once the session ended, forgetting the remembered objective', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open(LINK_WITH_CYCLE_CASH);
            harness.userId = null;
            open('');
            reset();
            expect(shown()).toBe(SizingObjective.MonthlyNet);
        });

        it('gives MonthlyNet on Reset once the bankroll passed the threshold, forgetting the remembered objective', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open(LINK_WITH_CYCLE_CASH);
            harness.availableCents = 900_000;
            open('');
            reset();
            expect(shown()).toBe(SizingObjective.MonthlyNet);
        });

        it('gives RuinFirst on Reset when the bankroll moved to another amount that is still below the threshold', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = 100_000;
            open(LINK_WITH_CYCLE_CASH);
            harness.availableCents = 200_000;
            open('');
            reset();
            expect(shown()).toBe(SizingObjective.RuinFirst);
        });

        it('gives MonthlyNet on Reset when the link carried an objective and the bankroll chose nothing', () => {
            harness.userId = 'user-1';
            harness.rulebook = withSwitch(SWITCH_CENTS);
            harness.availableCents = SWITCH_CENTS;
            open(LINK_WITH_CYCLE_CASH);
            reset();
            expect(shown()).toBe(SizingObjective.MonthlyNet);
        });
    });
});
