import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RuinFirstRankingModule from '~/lib/prop-calculator/economics/RuinFirstRanking';

const pricing = vi.hoisted(() => ({ calls: 0 }));

vi.mock('~/lib/prop-calculator/economics/RuinFirstRanking', async (load) => {
    const actual = await load<typeof RuinFirstRankingModule>();
    return {
        ...actual,
        priceBatchLoss: (
            ...parameters: Parameters<typeof actual.priceBatchLoss>
        ) => {
            pricing.calls += 1;
            return actual.priceBatchLoss(...parameters);
        },
    };
});

vi.mock('~/components/ui/InfoPopover', () => ({
    default: () => null,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/compare',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    async () => {
        const { defaultCalculatorState } =
            await import('~/app/(app)/prop-calculator/_components/calculatorReducer');
        return {
            useCalculatorActions: () => ({ applyState: vi.fn() }),
            useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
        };
    },
);

import {
    type ComparisonViewRequest,
    useComparisonView,
} from '~/app/(app)/prop-calculator/_components/FirmComparisonTable';
import {
    BatchLossCache,
    type PricedComparisonRow,
    type RankedComparison,
} from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import {
    dollars,
    findFirm,
    FirmId,
    type PlanId,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';

import {
    RUIN_FIXTURE_BANKROLL_CENTS,
    RUIN_FIXTURE_SPECS,
    ruinFixtureOut,
} from './ruinFirstRowFixtures';

interface Row extends PricedComparisonRow {
    readonly key: string;
}

const POSITIVE_EV_ROWS = RUIN_FIXTURE_SPECS.filter(
    (spec) => spec.evPerAttempt > 0,
).length;

const PLAN_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function baseOut() {
    const plan = findFirm(PLAN_ID.firm)?.findPlan(PLAN_ID);
    if (!plan) throw new Error('TopStep 50K plan not found');
    return simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 20,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 3,
        tradesPerDay: 1,
        trials: 30,
        winrate: 0.4,
    });
}

function fixtureRows(): Row[] {
    const base = baseOut();
    return RUIN_FIXTURE_SPECS.map((spec) => ({
        key: spec.key,
        out: ruinFixtureOut(base, spec),
    }));
}

describe('useComparisonView prices a row once, however the ranking is recomputed', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ranked: null | RankedComparison<Row> = null;
    const rows = fixtureRows();
    const ruinRequest: ComparisonViewRequest = {
        bankrollCents: RUIN_FIXTURE_BANKROLL_CENTS,
        isBankrollPending: false,
        objective: SizingObjective.RuinFirst,
        seed: 5,
    };

    function Probe(properties: {
        request: ComparisonViewRequest;
        rows: readonly Row[];
    }) {
        ranked = useComparisonView(properties.rows, properties.request).ranked;
        return null;
    }

    function render(
        request: ComparisonViewRequest,
        shown: readonly Row[] = rows,
    ): void {
        act(() => {
            root.render(<Probe request={request} rows={shown} />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        pricing.calls = 0;
        ranked = null;
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

    it('prices each positive EV row once on the first ruin first ranking', () => {
        render(ruinRequest);
        expect(ranked?.effective).toBe(SizingObjective.RuinFirst);
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS);
    });

    it('does not re-price when only the objective changes and comes back', () => {
        render(ruinRequest);
        render({ ...ruinRequest, objective: SizingObjective.MonthlyNet });
        render({ ...ruinRequest, objective: SizingObjective.CycleCash });
        render(ruinRequest);
        expect(ranked?.effective).toBe(SizingObjective.RuinFirst);
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS);
    });

    it('does not re-price when the rows array is rebuilt around the same rows', () => {
        render(ruinRequest);
        render(ruinRequest, [...rows]);
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS);
    });

    it('does not re-price when the pending flag flips', () => {
        render(ruinRequest);
        render({ ...ruinRequest, isBankrollPending: true });
        render(ruinRequest);
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS);
    });

    it('re-prices every row when the bankroll changes', () => {
        render(ruinRequest);
        render({
            ...ruinRequest,
            bankrollCents: RUIN_FIXTURE_BANKROLL_CENTS * 2,
        });
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS * 2);
    });

    it('re-prices every row when the seed changes', () => {
        render(ruinRequest);
        render({ ...ruinRequest, seed: ruinRequest.seed + 1 });
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS * 2);
    });

    it('re-prices only the row whose output was recomputed', () => {
        render(ruinRequest);
        const [first, ...rest] = rows;
        if (!first) throw new Error('no fixture rows');
        const recomputed: Row = {
            ...first,
            out: { ...first.out, netValues: [...first.out.netValues] },
        };
        render(ruinRequest, [recomputed, ...rest]);
        expect(pricing.calls).toBe(POSITIVE_EV_ROWS + 1);
    });

    it('never prices without a bankroll', () => {
        render({ ...ruinRequest, bankrollCents: null });
        expect(pricing.calls).toBe(0);
    });
});

describe('BatchLossCache', () => {
    const out = fixtureRows()[0]?.out;
    if (!out) throw new Error('no fixture rows');

    it('prices a row once per bankroll and seed, and again when either changes', () => {
        pricing.calls = 0;
        const cache = new BatchLossCache();
        const first = cache.pricing(out, dollars(1000), 1);
        expect(cache.pricing(out, dollars(1000), 1)).toBe(first);
        expect(pricing.calls).toBe(1);
        cache.pricing(out, dollars(2000), 1);
        expect(pricing.calls).toBe(2);
        cache.pricing(out, dollars(2000), 2);
        expect(pricing.calls).toBe(3);
    });
});
