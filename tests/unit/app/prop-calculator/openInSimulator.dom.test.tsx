import {
    act,
    type ReactNode,
    startTransition,
    useEffect,
    useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type MockInstance,
    vi,
} from 'vitest';

import {
    CalculatorProvider,
    useCalculatorActions,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import FirmComparisonTable from '~/app/(app)/prop-calculator/_components/FirmComparisonTable';
import PlanComparisonTable from '~/app/(app)/prop-calculator/_components/PlanComparisonTable';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    type OpenInSimulator,
    useOpenInSimulator,
} from '~/app/(app)/prop-calculator/_components/useOpenInSimulator';
import {
    findFirm,
    parseFirmId,
    serializePlanId,
} from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

enum ComparisonTable {
    Firm = 'firm',
    Plan = 'plan',
}

const ORIGIN = 'http://localhost';
const OPEN_LABEL = /^Open (.+) in the simulator$/;

const navigation = await vi.hoisted(async () => {
    const { createContext } = await import('react');
    const state: {
        setLocation: ((url: URL) => void) | null;
    } = { setLocation: null };
    return {
        LocationContext: createContext(new URL('http://localhost/')),
        router: {
            push: vi.fn((href: string) => {
                startTransition(() => {
                    state.setLocation?.(new URL(href, 'http://localhost'));
                });
            }),
            replace: vi.fn(),
        },
        state,
    };
});

vi.mock('next/navigation', async () => {
    const { useContext, useMemo } = await import('react');
    return {
        usePathname: () => useContext(navigation.LocationContext).pathname,
        useRouter: () => navigation.router,
        useSearchParams: () => {
            const url = useContext(navigation.LocationContext);
            return useMemo(() => new URLSearchParams(url.search), [url]);
        },
    };
});

const observed: {
    handlers: OpenInSimulator[];
    location: null | URL;
    setWinrate: ((value: number) => void) | null;
    state: CalculatorState | null;
} = {
    handlers: [],
    location: null,
    setWinrate: null,
    state: null,
};

function CompareProbe({ table }: { table: ComparisonTable }) {
    const { firms, planOptIns, simInputs, state } = useCalculatorInputs();
    useEffect(() => {
        observed.state = state;
    }, [state]);
    return table === ComparisonTable.Plan ? (
        <PlanComparisonTable
            activePlan={state.plan}
            baseInputs={simInputs}
            firm={state.firm}
            planOptIns={planOptIns}
        />
    ) : (
        <FirmComparisonTable
            activeFirmId={state.firm.id}
            baseInputs={simInputs}
            firms={firms}
            planOptIns={planOptIns}
            targetAccountSize={state.plan.accountSize}
        />
    );
}

function HandlerProbe() {
    const { planOptIns, state } = useCalculatorInputs();
    const { setWinrate } = useCalculatorActions();
    const open = useOpenInSimulator(planOptIns);
    useEffect(() => {
        observed.handlers.push(open);
        observed.setWinrate = setWinrate;
        observed.state = state;
    }, [open, setWinrate, state]);
    return null;
}

function Location({ children, start }: { children: ReactNode; start: string }) {
    const [url, setUrl] = useState(() => new URL(start, ORIGIN));
    useEffect(() => {
        navigation.state.setLocation = setUrl;
        observed.location = url;
    }, [url]);
    return (
        <navigation.LocationContext.Provider value={url}>
            {children}
        </navigation.LocationContext.Provider>
    );
}

function openButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll('button')].filter((button) =>
        OPEN_LABEL.test(button.getAttribute('aria-label') ?? ''),
    );
}

function pathnameOf(url: null | string | undefined | URL): string {
    return new URL(String(url ?? ''), ORIGIN).pathname;
}

describe('Open in the simulator from a comparison table', () => {
    let container: HTMLDivElement;
    let root: Root;
    let replaceState: MockInstance<History['replaceState']>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.router.push.mockClear();
        navigation.router.replace.mockClear();
        observed.handlers = [];
        observed.location = null;
        observed.setWinrate = null;
        observed.state = null;
        window.sessionStorage.clear();
        replaceState = vi.spyOn(window.history, 'replaceState');
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function renderCompare(table: ComparisonTable) {
        const start = {
            ...defaultCalculatorState(),
            trials: 100,
        };
        const compare = `${routes.propCalculator.compare}?${encodeState(start).toString()}`;
        window.history.replaceState(null, '', compare);
        act(() => {
            root.render(
                <Location start={compare}>
                    <CalculatorProvider>
                        <CompareProbe table={table} />
                    </CalculatorProvider>
                </Location>,
            );
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        replaceState.mockClear();
    }

    function pickRow(
        table: ComparisonTable,
        current: CalculatorState,
    ): HTMLButtonElement {
        const currentLabels = new Set(
            (table === ComparisonTable.Plan
                ? [current.plan]
                : current.firm.plans
            ).map((plan) => `Open ${plan.label} in the simulator`),
        );
        const candidate = openButtons().find(
            (button) =>
                !currentLabels.has(button.getAttribute('aria-label') ?? ''),
        );
        if (candidate === undefined) throw new Error('no row to open');
        return candidate;
    }

    it.each([ComparisonTable.Plan, ComparisonTable.Firm])(
        'the %s table moves to the simulator with the row plan and never rewrites the compare URL',
        async (table) => {
            await renderCompare(table);
            const before = observed.state;
            if (before === null) throw new Error('provider state not observed');
            const button = pickRow(table, before);
            const label = OPEN_LABEL.exec(
                button.getAttribute('aria-label') ?? '',
            )?.[1];

            await act(async () => {
                button.click();
                await vi.advanceTimersByTimeAsync(0);
            });

            const rewritten = replaceState.mock.calls.map((call) =>
                pathnameOf(call[2]),
            );
            expect(rewritten).not.toContain(routes.propCalculator.compare);
            expect(navigation.router.push).toHaveBeenCalledTimes(1);
            const pushed = new URL(
                String(navigation.router.push.mock.calls[0]?.[0]),
                ORIGIN,
            );
            expect(pushed.pathname).toBe(routes.propCalculator.simulator);
            const firmId = parseFirmId(pushed.searchParams.get('firm') ?? '');
            const firm = firmId === undefined ? undefined : findFirm(firmId);
            const plan = firm?.findPlanBySerial(
                pushed.searchParams.get('plan') ?? '',
            );
            expect(plan?.label).toBe(label);

            const after = observed.state;
            expect(after?.firm.id).toBe(firm?.id);
            expect(
                table === ComparisonTable.Firm
                    ? after?.firm.id !== before.firm.id
                    : after?.plan.id !== before.plan.id,
            ).toBe(true);
            expect(after === null ? null : serializePlanId(after.plan.id)).toBe(
                pushed.searchParams.get('plan'),
            );
            expect(after?.takesFundedReset).toBe(before.takesFundedReset);
            expect(after?.takesOneTimeEarlyWithdrawal).toBe(
                before.takesOneTimeEarlyWithdrawal,
            );
            expect(observed.location?.pathname).toBe(
                routes.propCalculator.simulator,
            );
        },
    );

    it('keeps one handler while calculator inputs change, so the table columns are not rebuilt', async () => {
        const compare = `${routes.propCalculator.compare}?${encodeState(defaultCalculatorState()).toString()}`;
        window.history.replaceState(null, '', compare);
        act(() => {
            root.render(
                <Location start={compare}>
                    <CalculatorProvider>
                        <HandlerProbe />
                    </CalculatorProvider>
                </Location>,
            );
        });
        const before = observed.state?.winrate;
        act(() => {
            observed.setWinrate?.(0.61);
        });
        expect(observed.state?.winrate).not.toBe(before);
        expect(new Set(observed.handlers).size).toBe(1);
    });
});
