import { describe, expect, it } from 'vitest';

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
    AssumptionBias,
    AssumptionKind,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    inputAssumption,
    ladderStepWidenedAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

const BASE_STEP = 100;

function accountWithCushion(
    cushion: number,
    assumptions: ReconstructedFundedOrEvalAccount['assumptions'] = [],
): ReconstructedFundedOrEvalAccount {
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
    return {
        assumptions,
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorAt(
    cushion: number,
    assumptions: ReconstructedFundedOrEvalAccount['assumptions'] = [],
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: accountWithCushion(cushion, assumptions),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

function widenedAssumptionsOf(advisor: EvalSizingAdvisor) {
    return advisor
        .assemble([])
        .assumptions.filter(
            (assumption) =>
                assumption.kind === AssumptionKind.LadderStepWidened,
        );
}

describe('EvalSizingAdvisor lists a widened ladder step as an assumption (PT-24d, F-133)', () => {
    it('lists it as a neutral input assumption at a $2,000 cushion, where the step is widened, because a coarser grid gives no safety guarantee', () => {
        const advisor = advisorAt(2000);
        const [request] = advisor.optimumRequests();
        if (request === undefined || !('grid' in request)) {
            throw new Error('expected a ladder request');
        }

        expect(request.grid.step).toBeGreaterThan(BASE_STEP);
        expect(widenedAssumptionsOf(advisor)).toStrictEqual([
            ladderStepWidenedAssumption(
                request.grid.step,
                AssumptionBias.Neutral,
            ),
        ]);
        expect(widenedAssumptionsOf(advisor)).toStrictEqual([
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: 140,
            },
        ]);
    });

    it.each([50, 800, 1000, 1500])(
        'lists nothing at a $%d cushion, where the default $100 step fits',
        (cushion) => {
            expect(widenedAssumptionsOf(advisorAt(cushion))).toStrictEqual([]);
        },
    );

    it.each([2500, 5000, 50_000])(
        'lists it once, never repeated, at a $%d cushion',
        (cushion) => {
            expect(widenedAssumptionsOf(advisorAt(cushion))).toHaveLength(1);
        },
    );

    it('keeps the reconstruction assumptions ahead of it', () => {
        const reconstructed = inputAssumption(
            AssumptionKind.NoHolidayCalendar,
            AssumptionBias.Neutral,
        );

        const { assumptions } = advisorAt(2000, [reconstructed]).assemble([]);

        expect(assumptions[0]).toStrictEqual(reconstructed);
        expect(assumptions.map((assumption) => assumption.kind)).toContain(
            AssumptionKind.LadderStepWidened,
        );
    });
});
