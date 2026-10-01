import { describe, expect, it } from 'vitest';

import { type WorkerTaskRequest } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    copyGroupRequestCacheKey,
    type CopyGroupWorkerMember,
    CopyGroupWorkerOutcomeKind,
    type CopyGroupWorkerRequest,
    simulateGroupOutcomeOf,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import {
    type AccountState,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    type FundedCycleSeed,
    InstrumentSymbol,
    MffuVariant,
    type PlanId,
    RungSizing,
} from '~/lib/prop-calculator';
import { CopyGroupSimulationRejectionKind } from '~/lib/prop-calculator/simulator';

const PLAN_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
};

const UNREGISTERED_PLAN_ID = {
    accountSize: 1,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
} as unknown as PlanId;

function fundedState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 50_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 47_500,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
        ...overrides,
    };
}

function memberFor(
    id: string,
    overrides: Partial<CopyGroupWorkerMember> = {},
): CopyGroupWorkerMember {
    return {
        id,
        minRetainedCushion: dollars(0),
        payoutRequestSize: undefined,
        planId: PLAN_ID,
        riskPerTrade: dollars(400),
        rungSizing: RungSizing.CapToCushion,
        seed: seed(),
        state: fundedState(),
        stopRule: { kind: DayStopRuleKind.None },
        tradesPerDay: 2,
        ...overrides,
    };
}

function requestFor(
    members: readonly CopyGroupWorkerMember[],
    overrides: Partial<CopyGroupWorkerRequest> = {},
): CopyGroupWorkerRequest {
    return {
        commission: dollars(0),
        fundedHorizonDays: 20,
        members,
        positionSizing: null,
        rrRatio: 2,
        seed: 42,
        trials: 50,
        winrate: fraction(0.5),
        ...overrides,
    };
}

function seed(overrides: Partial<FundedCycleSeed> = {}): FundedCycleSeed {
    return {
        calendarDayGateProgress: 0,
        cumulativePayout: 0,
        cycleBestDayProfit: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: 50_000,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: 0,
        ...overrides,
    };
}

describe('copyGroupWorkerMessages (PT-42)', () => {
    it('round-trips a request and its worker envelope through structuredClone (no closures or class instances)', () => {
        const request = requestFor([memberFor('a'), memberFor('b')]);
        const envelope: WorkerTaskRequest<CopyGroupWorkerRequest> = {
            request,
            runId: 3,
        };
        expect(structuredClone(envelope)).toEqual(envelope);
    });

    it('gives the same cache key for structurally identical requests and a different key when a member risk changes', () => {
        const requestA = requestFor([memberFor('a')]);
        const requestB = requestFor([memberFor('a')]);
        expect(copyGroupRequestCacheKey(requestA)).toBe(
            copyGroupRequestCacheKey(requestB),
        );

        const requestC = requestFor([
            memberFor('a', { riskPerTrade: dollars(500) }),
        ]);
        expect(copyGroupRequestCacheKey(requestA)).not.toBe(
            copyGroupRequestCacheKey(requestC),
        );
    });

    it('keys a request independently of the run id of the worker envelope that carries it', () => {
        const request = requestFor([memberFor('a')]);
        const first: WorkerTaskRequest<CopyGroupWorkerRequest> = {
            request,
            runId: 1,
        };
        const second: WorkerTaskRequest<CopyGroupWorkerRequest> = {
            request,
            runId: 2,
        };
        expect(copyGroupRequestCacheKey(first.request)).toBe(
            copyGroupRequestCacheKey(second.request),
        );
    });

    it('runs the group and returns a Simulated outcome for a valid request', () => {
        const request = requestFor([memberFor('solo')], { trials: 20 });
        const outcome = simulateGroupOutcomeOf(request);
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Simulated);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Simulated) return;
        expect(outcome.result.memberIds).toStrictEqual(['solo']);
    });

    it('returns a typed Rejected outcome for an already-busted member, never a thrown error', () => {
        const bustedMember = memberFor('busted', {
            state: fundedState({ balance: 0 }),
        });
        const outcome = simulateGroupOutcomeOf(requestFor([bustedMember]));
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Rejected);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Rejected) return;
        expect(outcome.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MemberRefused,
        );
    });

    it('returns a typed Rejected outcome for a member whose risk is below one contract at the group stop', () => {
        const request = requestFor(
            [memberFor('small', { riskPerTrade: dollars(300) })],
            {
                positionSizing: {
                    instrument: InstrumentSymbol.ES,
                    stopPoints: 10,
                },
            },
        );
        const outcome = simulateGroupOutcomeOf(request);
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Rejected);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Rejected) return;
        expect(outcome.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MemberRefused,
        );
    });

    it('returns a typed Rejected outcome for duplicate member ids', () => {
        const outcome = simulateGroupOutcomeOf(
            requestFor([memberFor('same'), memberFor('same')]),
        );
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Rejected);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Rejected) return;
        expect(outcome.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.DuplicateMemberId,
        );
    });

    it('turns an unusable stop distance into a typed Failed outcome instead of silently dropping position sizing', () => {
        const outcome = simulateGroupOutcomeOf(
            requestFor([memberFor('a')], {
                positionSizing: {
                    instrument: InstrumentSymbol.ES,
                    stopPoints: 0,
                },
            }),
        );
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
    });

    it('turns an unresolvable plan into a typed Failed outcome, never a thrown error', () => {
        const outcome = simulateGroupOutcomeOf(
            requestFor([
                memberFor('missing-plan', { planId: UNREGISTERED_PLAN_ID }),
            ]),
        );
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Failed) return;
        expect(outcome.reason.length).toBeGreaterThan(0);
    });
});
