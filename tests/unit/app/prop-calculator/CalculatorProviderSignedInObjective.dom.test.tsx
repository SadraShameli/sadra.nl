import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorProvider,
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

const harness = vi.hoisted(
    (): Harness => ({
        availableCents: null,
        queryOptions: {},
        rulebook: null,
        userId: null,
    }),
);

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
                                    : { availableCents: harness.availableCents },
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

function ObjectiveProbe() {
    const { state } = useCalculatorInputs();
    return <output data-testid="objective">{state.objective}</output>;
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
});
