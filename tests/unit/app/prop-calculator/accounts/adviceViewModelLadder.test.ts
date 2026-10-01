import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
    OptimumRowStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { assumptionLabel } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    AssumptionKind,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

function freshEvalAdvisor(cushion: number): EvalSizingAdvisor {
    const state: AccountState = {
        balance: 50_000 + cushion,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit: null,
        state,
    };
    return new EvalSizingAdvisor({
        account,
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 5,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
    });
}

function readyViewOf(advice: ReturnType<EvalSizingAdvisor['assemble']>) {
    const view = adviceViewModel(advice);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    return view;
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

describe('the advice view model states a widened ladder step (PT-24d, F-133)', () => {
    it('a fresh 50K eval with a $2,000 cushion lists the widened step with its size', () => {
        const advisor = freshEvalAdvisor(2000);

        const view = readyViewOf(advisor.assemble([]));

        const widened = view.assumptions.find((assumption) =>
            assumption.text.includes('coarser'),
        );
        expect(widened).toBeDefined();
        expect(widened?.text).toContain('$140');
    });

    it('a $1,500 cushion keeps the $100 step and lists no widened-step text', () => {
        const view = readyViewOf(freshEvalAdvisor(1500).assemble([]));

        expect(
            view.assumptions.some((assumption) =>
                assumption.text.includes('coarser'),
            ),
        ).toBe(false);
    });

    it('has a label for the widened-step kind on the detail state', () => {
        expect(assumptionLabel(AssumptionKind.LadderStepWidened)).toContain(
            'coarser',
        );
    });
});

describe('the advice view model shows a refused ladder search (PT-24d, F-133)', () => {
    it('renders a left-out row that says the ladder search was not run because the grid is too large', () => {
        const advisor = freshEvalAdvisor(2000);
        const requests = advisor.optimumRequests().map((request) => ({
            ...request,
            maxGridSize: 10,
        }));
        const results = requests.map((request) =>
            runEngineOptimum(registryPlan(), request),
        );

        const view = readyViewOf(advisor.assemble(results));

        const row = view.optima.find(
            (candidate) => candidate.source === AdviceSource.LadderSearchFresh,
        );
        expect(row?.status).toBe(OptimumRowStatus.LeftOut);
        expect(row?.text).toContain('ladder search not run: grid too large');
        expect(row?.text).toContain('1,554');
        expect(row?.text).toContain('10');
        expect(row?.text).not.toContain('No ladder scored');
    });
});
