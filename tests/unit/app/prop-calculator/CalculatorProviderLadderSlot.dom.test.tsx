import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorProvider,
    useCalculatorActions,
    useLabSlots,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { ladderSearchInputsFor } from '~/app/(app)/prop-calculator/_components/ladderLabRestore';
import {
    type LadderResultSlot,
    LadderSlotEvent,
} from '~/app/(app)/prop-calculator/_components/ladderResultSlot';
import { LadderRunPhase } from '~/app/(app)/prop-calculator/_components/ladderSearchTypes';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    RungSizing,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({
    pathname: '/',
    router: { replace: vi.fn<(href: string) => void>() },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => navigation.router,
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: { useQuery: () => ({ data: undefined }) },
            },
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

function cancelledSlot(completed: number): LadderResultSlot {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return {
        cancelledByNavigation: true,
        displayInstrument: InstrumentSymbol.NQ,
        inputs: ladderSearchInputsFor(
            {
                fundedHorizonDays: 60,
                instrument: InstrumentSymbol.NQ,
                maxEvalDays: 60,
                plan,
                riskPerTrade: 250,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                seed: 42,
                stopPoints: 10,
                tradesPerDay: 2,
                trials: 2000,
                winrate: 0.4,
            },
            {
                displayInstrument: InstrumentSymbol.NQ,
                grid: { lo: 100, max: 400, slots: 3, step: 100 },
                rungSizing: RungSizing.CapToCushion,
                sims: 100,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
        ),
        result: {
            phase: LadderRunPhase.Cancelled,
            progress: { completed, elapsedMs: 10, etaMs: null, total: 40 },
        },
    };
}

describe('CalculatorProvider ladder slot', () => {
    let container: HTMLDivElement;
    let root: Root;
    let write:
        null | ReturnType<typeof useCalculatorActions>['writeLadderSlot'];
    let observed: (LadderResultSlot | null)[];

    function Probe({ page }: { page: string }) {
        write = useCalculatorActions().writeLadderSlot;
        observed.push(useLabSlots().ladderSlot);
        return <span data-page={page} />;
    }

    function render(page: string) {
        act(() => {
            root.render(
                <CalculatorProvider>
                    <Probe page={page} />
                </CalculatorProvider>,
            );
        });
    }

    function slotNow(): LadderResultSlot | null {
        return observed.at(-1) ?? null;
    }

    function writeSlot(event: LadderSlotEvent, slot: LadderResultSlot | null) {
        act(() => {
            write?.(event, slot);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.history.replaceState(null, '', routes.propCalculator.ladderLab);
        navigation.pathname = routes.propCalculator.ladderLab;
        window.sessionStorage.clear();
        observed = [];
        write = null;
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

    it('starts with no slot', () => {
        render('ladder-lab');
        expect(slotNow()).toBeNull();
    });

    it.each([
        LadderSlotEvent.Cancelled,
        LadderSlotEvent.Completed,
        LadderSlotEvent.Unmounted,
    ])('ignores a null slot written for %s', (event) => {
        render('ladder-lab');
        writeSlot(LadderSlotEvent.Completed, cancelledSlot(5));
        const stored = slotNow();
        writeSlot(event, null);
        expect(slotNow()).toBe(stored);
        expect(stored).not.toBeNull();
    });

    it('ignores a Progress event even with a slot', () => {
        render('ladder-lab');
        writeSlot(LadderSlotEvent.Progress, cancelledSlot(5));
        expect(slotNow()).toBeNull();
    });

    it.each([
        LadderSlotEvent.Cancelled,
        LadderSlotEvent.Completed,
        LadderSlotEvent.Unmounted,
    ])('stores the slot written for %s and replaces an older one', (event) => {
        render('ladder-lab');
        const first = cancelledSlot(5);
        const second = cancelledSlot(9);
        writeSlot(event, first);
        expect(slotNow()).toBe(first);
        writeSlot(event, second);
        expect(slotNow()).toBe(second);
    });

    it('keeps the slot when the page moves to another tool under the one provider', () => {
        render('ladder-lab');
        const stored = cancelledSlot(7);
        writeSlot(LadderSlotEvent.Unmounted, stored);
        navigation.pathname = routes.propCalculator.simulator;
        window.history.replaceState(null, '', routes.propCalculator.simulator);
        render('simulator');
        expect(
            container.querySelector('[data-page="simulator"]'),
        ).not.toBeNull();
        expect(slotNow()).toBe(stored);
        navigation.pathname = routes.propCalculator.ladderLab;
        render('ladder-lab');
        expect(slotNow()).toBe(stored);
    });
});
