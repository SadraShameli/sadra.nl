import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    ladderTrialStreams,
    type Plan,
    type PlanId,
    scoreLadder,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    EvalSizingAdvisor,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    type LadderSearchRequest,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import { ladderUnderPersonalDayLimits } from '~/lib/prop-calculator/advisor/policy';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const DOCUMENTED_LADDER_SEED_OFFSET = 1;

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(APEX_EOD_ID);

function account(
    state: AccountState = accountState(),
): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function accountState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 52_000,
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
        ...overrides,
    };
}

function advisorWith(
    options: {
        readonly personalDll?: number;
        readonly state?: AccountState;
    } = {},
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: account(options.state),
        maxEvalDays: 150,
        substate: null,
        ...(options.personalDll !== undefined && {
            personalDll: dollars(options.personalDll),
        }),
        rulebook: DEFAULT_RULEBOOK,
        seed: 7,
        sims: 300,
        snapshotAsOf: '2026-09-26',
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

function scoredOf(result: LadderEngineOptimumResult) {
    if (result.kind !== LadderEngineOptimumResultKind.Scored) {
        throw new Error('expected a scored ladder result');
    }
    return result;
}

describe('the documented-ladder score runs in the engine-optimum runner (PT-19h, F-119)', () => {
    it('carries the documented ladder rungs in the serializable ladder request', () => {
        const advisor = advisorWith();
        const documented = advisor.documented();

        const request = ladderRequestOf(advisor);

        expect(documented?.rungs.length).toBeGreaterThan(0);
        expect(request.documentedLadder).toEqual(
            documented?.rungs.map((rung) => rung.risk),
        );
        expect(structuredClone(request)).toEqual(request);
    });

    it('carries no documented ladder when the advice is stale and nothing is sized', () => {
        const advisor = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 60,
            rulebook: DEFAULT_RULEBOOK,
            sims: 60,
            snapshotAsOf: '2020-01-01',
            substate: null,
            today: '2026-09-26',
        });

        expect(advisor.documented()).toBeNull();
        expect(ladderRequestOf(advisor).documentedLadder).toBeUndefined();
    });

    it('scores the documented ladder in the runner on an independent seed, with the same score config as the search', () => {
        const request = ladderRequestOf(advisorWith());

        const result = scoredOf(
            runEngineOptimum(plan, request) as LadderEngineOptimumResult,
        );

        const expected = scoreLadder(
            request.documentedLadder ?? [],
            { ...request.score, plan },
            ladderTrialStreams(request.seed + DOCUMENTED_LADDER_SEED_OFFSET),
        );
        expect(result.documentedScore).toEqual(expected);
        expect(Number.isFinite(expected.costPerFunded)).toBe(true);
    });

    it('scores no documented ladder when the request carries none', () => {
        const request: LadderSearchRequest = {
            ...ladderRequestOf(advisorWith()),
            documentedLadder: undefined,
        };

        const result = scoredOf(
            runEngineOptimum(plan, request) as LadderEngineOptimumResult,
        );

        expect(result.documentedScore).toBeUndefined();
    });

    it('scores the documented ladder through the personal day limits, which leave an already limited documented ladder unchanged', () => {
        const advisor = advisorWith({ personalDll: 600 });
        const request = ladderRequestOf(advisor);
        const { dayLimits, documentedLadder } = request;
        if (dayLimits === undefined || documentedLadder === undefined) {
            throw new Error('expected day limits and a documented ladder');
        }

        const limited = ladderUnderPersonalDayLimits(
            documentedLadder,
            dayLimits,
            request.score.rrRatio,
        );
        const result = scoredOf(
            runEngineOptimum(plan, request) as LadderEngineOptimumResult,
        );

        expect(limited).toEqual(documentedLadder);
        expect(result.documentedScore).toEqual(
            scoreLadder(
                limited,
                { ...request.score, plan },
                ladderTrialStreams(
                    request.seed + DOCUMENTED_LADDER_SEED_OFFSET,
                ),
            ),
        );
    });

    it('scores a documented ladder that breaks a day limit through ladderUnderPersonalDayLimits', () => {
        const request = ladderRequestOf(advisorWith({ personalDll: 600 }));
        const { dayLimits } = request;
        if (dayLimits === undefined) throw new Error('expected day limits');
        const oversized: LadderSearchRequest = {
            ...request,
            documentedLadder: [5000, 5000, 5000],
        };

        const result = scoredOf(
            runEngineOptimum(plan, oversized) as LadderEngineOptimumResult,
        );

        const limited = ladderUnderPersonalDayLimits(
            [5000, 5000, 5000],
            dayLimits,
            request.score.rrRatio,
        );
        expect(limited).not.toEqual([5000, 5000, 5000]);
        expect(result.documentedScore?.ladder).toEqual([...limited]);
    });

    it('assemble reads the runner documented score and never simulates on the calling thread', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/lib/prop-calculator/advisor/EvalSizingAdvisor.ts',
            ),
            'utf8',
        );

        expect(source).not.toMatch(/\bscoreLadder\b/);
        expect(source).not.toMatch(/\bladderTrialStreams\b/);
    });

    it('says WithinNoise from the runner documented score and stays silent when the result carries none', () => {
        const advisor = advisorWith();
        const request = ladderRequestOf(advisor);
        const ran = scoredOf(
            runEngineOptimum(plan, request) as LadderEngineOptimumResult,
        );
        const optimum = ran.ladder.bySpeed[0];
        if (optimum === undefined) throw new Error('expected an optimum');
        const withNoise = {
            ...ran,
            documentedScore: {
                ...optimum,
                costPerFundedStandardError: 1e9,
                expectedDaysToFundedStandardError: 1e9,
            },
        };
        const without = { ...ran, documentedScore: undefined };

        const reasonsWith = advisor.assemble([withNoise]).differenceReasons;
        const reasonsWithout = advisor.assemble([without]).differenceReasons;

        expect(
            reasonsWith.some(
                (reason) => reason.kind === DifferenceReason.WithinNoise,
            ),
        ).toBe(true);
        expect(
            reasonsWithout.some(
                (reason) => reason.kind === DifferenceReason.WithinNoise,
            ),
        ).toBe(false);
    });
});
