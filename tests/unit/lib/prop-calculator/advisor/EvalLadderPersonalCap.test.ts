import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    EvalSizingAdvisor,
    LadderEngineOptimumResultKind,
    type LadderSearchRequest,
    NO_PERSONAL_CAPS,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

const DEFAULT_GRID_AT_2000 = { lo: 100, max: 800, slots: 4, step: 140 };

function accountWithCushion(
    cushion: number,
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
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit: null,
        state,
    };
}

function advisorWith(
    maxRiskPerTrade: Dollars | null,
    cushion = 2000,
    sims = 40,
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: accountWithCushion(cushion),
        maxEvalDays: 40,
        personalCaps: { ...NO_PERSONAL_CAPS, maxRiskPerTrade },
        rulebook: DEFAULT_RULEBOOK,
        sims,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function ladderRequestOf(advisor: EvalSizingAdvisor): LadderSearchRequest {
    const [request] = advisor.optimumRequests();
    if (
        request?.source !== AdviceSource.LadderSearchFresh &&
        request?.source !== AdviceSource.LadderSearchFromState
    ) {
        throw new Error('expected a ladder search request');
    }
    return request;
}

function personalCapReasons(advisor: EvalSizingAdvisor) {
    return advisor
        .assemble([])
        .differenceReasons.flatMap((reason) =>
            reason.kind === DifferenceReason.PersonalCap ? [reason] : [],
        );
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

describe('the eval ladder search never looks above the personal max risk per trade (PT-68e, F-V16)', () => {
    it('keeps the default grid when no personal max risk is set', () => {
        const request = ladderRequestOf(advisorWith(null));

        expect(request.grid).toStrictEqual(DEFAULT_GRID_AT_2000);
        expect(personalCapReasons(advisorWith(null))).toEqual([]);
    });

    it('keeps the default grid when the personal cap is above every searched rung', () => {
        const advisor = advisorWith(dollars(5000));

        expect(ladderRequestOf(advisor).grid).toStrictEqual(
            DEFAULT_GRID_AT_2000,
        );
        expect(personalCapReasons(advisor)).toEqual([]);
    });

    it('searches the personal cap itself as the top rung, on whole-cent levels, when it sits between two default levels', () => {
        const { grid } = ladderRequestOf(advisorWith(dollars(450)));

        expect(grid).toStrictEqual({ lo: 100, max: 450, slots: 4, step: 87.5 });
    });

    it('keeps the default step when the personal cap lands on a default level', () => {
        const { grid } = ladderRequestOf(advisorWith(dollars(380)));

        expect(grid).toStrictEqual({ ...DEFAULT_GRID_AT_2000, max: 380 });
    });

    it('searches the cap as the second rung when it sits just above the floor', () => {
        const { grid } = ladderRequestOf(advisorWith(dollars(150)));

        expect(grid.lo).toBe(100);
        expect(grid.max).toBe(150);
        expect(grid.step).toBe(50);
    });

    it('searches the single rung value at the personal cap when the cap is below the grid floor', () => {
        const { grid } = ladderRequestOf(advisorWith(dollars(60)));

        expect(grid.lo).toBe(60);
        expect(grid.max).toBe(60);
    });

    it('never scores a ladder with a rung above the personal cap', () => {
        const advisor = advisorWith(dollars(250));
        const request = ladderRequestOf(advisor);

        const result = runEngineOptimum(registryPlan(), request);

        expect(result.source).toBe(AdviceSource.LadderSearchFresh);
        if (
            result.source !== AdviceSource.LadderSearchFresh ||
            result.kind !== LadderEngineOptimumResultKind.Scored
        ) {
            throw new Error('expected a scored ladder search');
        }
        const scored = [
            ...result.ladder.bySpeed,
            ...result.ladder.byCost,
            ...result.ladder.byPassRate,
        ];
        expect(scored.length).toBeGreaterThan(0);
        for (const score of scored) {
            expect(Math.max(...score.ladder)).toBeLessThanOrEqual(250);
        }
    });

    it('says the search was capped by the personal limit, with the cap, only when the cap narrowed it', () => {
        const capped = advisorWith(dollars(250));

        const reason = {
            cap: dollars(250),
            kind: DifferenceReason.PersonalCap,
        } as const;

        expect(personalCapReasons(capped)).toEqual([reason]);
        expect(differenceReasonText(reason)).toContain('$250.00');
        const loose = advisorWith(dollars(5000));
        const uncapped = advisorWith(null);
        expect(personalCapReasons(loose)).toEqual([]);
        expect(personalCapReasons(uncapped)).toEqual([]);
    });
});
