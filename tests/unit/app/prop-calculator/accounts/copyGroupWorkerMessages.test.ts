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
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    type FundedCycleSeed,
    fundedStartContractLimit,
    InstrumentSymbol,
    MffuVariant,
    oneContractRisk,
    type PlanId,
    resolvePositionSizing,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type EnginePolicy,
    enginePolicySchema,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { CopyGroupSimulationRejectionKind } from '~/lib/prop-calculator/simulator';

const PLAN_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
};

const OPT_INS = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};

const UNREGISTERED_PLAN_SERIAL = 'mffu-1-rapid-eod-unregistered';

const DEFAULT_RISK_CENTS = 40_000;

function enginePolicyFor(overrides: Partial<EnginePolicy> = {}): EnginePolicy {
    return enginePolicySchema.parse({
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 20,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: null,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: null,
        ...overrides,
    });
}

function fundedStart(overrides: Partial<AccountState> = {}) {
    return {
        phase: TradingPhase.Funded as const,
        seed: seed(),
        state: fundedState(overrides),
    };
}

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
        firmId: FirmId.Mffu,
        id,
        optIns: OPT_INS,
        planSerial: serializePlanId(PLAN_ID),
        spec: specFor(),
        start: fundedStart(),
        ...overrides,
    };
}

function requestFor(
    members: readonly CopyGroupWorkerMember[],
    overrides: Partial<CopyGroupWorkerRequest> = {},
): CopyGroupWorkerRequest {
    return { members, seed: 42, trials: 50, ...overrides };
}

function reversedKeys<Value extends object>(value: Value): Value {
    return Object.fromEntries(Object.entries(value).toReversed()) as Value;
}

function rulebookFor(
    riskCents: number,
    strategy: Partial<RulebookParameters['strategy']> = {},
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        funded: {
            ...DEFAULT_RULEBOOK.funded,
            riskCents,
            takeProfitCents: riskCents * 2,
            tradesPerDayMax: 2,
        },
        strategy: { ...DEFAULT_RULEBOOK.strategy, ...strategy },
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

function simulatedGroup(
    members: readonly CopyGroupWorkerMember[],
    trials = 200,
) {
    const outcome = simulateGroupOutcomeOf(requestFor(members, { trials }));
    if (outcome.kind !== CopyGroupWorkerOutcomeKind.Simulated) {
        throw new Error(
            `expected a simulated outcome, received ${outcome.kind}`,
        );
    }
    return outcome.result;
}

function sizedMember(
    id: string,
    riskCents: number,
    stopPoints: number,
    instrument = InstrumentSymbol.ES,
): CopyGroupWorkerMember {
    return memberFor(id, {
        spec: specFor(riskCents, { instrument, stopPoints }),
    });
}

function specFor(
    riskCents = DEFAULT_RISK_CENTS,
    policy: Partial<EnginePolicy> = {},
    strategy: Partial<RulebookParameters['strategy']> = {},
): DocumentedPolicySpec {
    return {
        enginePolicy: enginePolicyFor(policy),
        rulebook: rulebookFor(riskCents, strategy),
        run: { maxEvalDays: 30, seed: 1, trials: 50 },
    };
}

function withPolicy(
    id: string,
    policy: Partial<EnginePolicy>,
): CopyGroupWorkerMember {
    return memberFor(id, { spec: specFor(DEFAULT_RISK_CENTS, policy) });
}

describe('copyGroupWorkerMessages (PT-42b)', () => {
    it('round-trips a request and its worker envelope through structuredClone (no closures or class instances)', () => {
        const request = requestFor([memberFor('a'), memberFor('b')]);
        const envelope: WorkerTaskRequest<CopyGroupWorkerRequest> = {
            request,
            runId: 3,
        };
        expect(structuredClone(envelope)).toEqual(envelope);
    });

    describe('request cache key', () => {
        const base = requestFor([memberFor('a'), memberFor('b')]);
        const baseKey = copyGroupRequestCacheKey(base);
        const second = memberFor('b');
        const changedFirst = (
            overrides: Partial<CopyGroupWorkerMember>,
        ): CopyGroupWorkerRequest =>
            requestFor([memberFor('a', overrides), second]);
        const changes: readonly [string, CopyGroupWorkerRequest][] = [
            ['the seed', { ...base, seed: 43 }],
            ['the trial count', { ...base, trials: 51 }],
            ['a member funded risk', changedFirst({ spec: specFor(50_000) })],
            [
                'a member engine policy retained cushion',
                changedFirst({
                    spec: specFor(DEFAULT_RISK_CENTS, {
                        retainedCushionRequest: 2500,
                    }),
                }),
            ],
            [
                'a member engine policy lifetime payout cap',
                changedFirst({
                    spec: specFor(DEFAULT_RISK_CENTS, {
                        lifetimePayoutCapBasis:
                            LifetimePayoutCapBasis.VerifiedCountTrigger,
                        lifetimePayoutCapOverride: 3,
                    }),
                }),
            ],
            [
                'a member engine policy instrument and stop',
                changedFirst({
                    spec: specFor(DEFAULT_RISK_CENTS, {
                        instrument: InstrumentSymbol.MNQ,
                        stopPoints: 20,
                    }),
                }),
            ],
            [
                'a member balance',
                changedFirst({ start: fundedStart({ balance: 50_100 }) }),
            ],
            [
                'a member payout count',
                changedFirst({
                    start: {
                        ...fundedStart(),
                        seed: seed({ payoutsIssued: 1 }),
                    },
                }),
            ],
            [
                'a member plan opt-in',
                changedFirst({
                    optIns: { ...OPT_INS, takesFundedReset: true },
                }),
            ],
            ['the member order', requestFor([second, memberFor('a')])],
        ];

        it.each(changes)('changes when %s changes', (_name, changed) => {
            expect(copyGroupRequestCacheKey(changed)).not.toBe(baseKey);
        });

        it('does not depend on property insertion order', () => {
            const reordered = reversedKeys({
                ...base,
                members: base.members.map((member) => reversedKeys(member)),
            });
            expect(Object.keys(reordered)).not.toEqual(Object.keys(base));
            expect(copyGroupRequestCacheKey(reordered)).toBe(baseKey);
        });
    });

    it('runs the group and returns a Simulated outcome for a valid request', () => {
        const result = simulatedGroup([memberFor('solo')], 20);
        expect(result.memberIds).toStrictEqual(['solo']);
    });

    it('returns a typed Rejected outcome for an already-busted member, never a thrown error', () => {
        const bustedMember = memberFor('busted', {
            start: fundedStart({ balance: 0 }),
        });
        const outcome = simulateGroupOutcomeOf(requestFor([bustedMember]));
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

    it('returns a typed Rejected outcome for a mixed-stage group', () => {
        const evalMember = memberFor('eval', {
            start: {
                phase: TradingPhase.Eval,
                state: fundedState({ balance: 50_000 }),
            },
        });
        const outcome = simulateGroupOutcomeOf(
            requestFor([memberFor('funded'), evalMember]),
        );
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Rejected);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Rejected) return;
        expect(outcome.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MixedStage,
        );
    });

    describe('a member sized through its own engine policy', () => {
        it('refuses a member whose own policy sizes below one contract, naming it and stripping the engine prefix', () => {
            const outcome = simulateGroupOutcomeOf(
                requestFor([
                    sizedMember('fine', 60_000, 10),
                    sizedMember('too-small', 30_000, 10),
                ]),
            );
            expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Rejected);
            if (outcome.kind !== CopyGroupWorkerOutcomeKind.Rejected) return;
            const { rejection } = outcome;
            expect(rejection.kind).toBe(
                CopyGroupSimulationRejectionKind.MemberRefused,
            );
            if (
                rejection.kind !==
                CopyGroupSimulationRejectionKind.MemberRefused
            ) {
                return;
            }
            expect(rejection.memberId).toBe('too-small');
            expect(rejection.message).toMatch(/below one ES contract/);
            expect(rejection.message).not.toMatch(/^Invalid SimInputs/);
        });

        it('places the group risk in whole contracts under the member own instrument and stop', () => {
            const sizedLow = simulatedGroup([sizedMember('a', 75_000, 10)]);
            const sizedHigh = simulatedGroup([sizedMember('a', 99_900, 10)]);
            const unsizedLow = simulatedGroup([
                memberFor('a', { spec: specFor(75_000) }),
            ]);
            const unsizedHigh = simulatedGroup([
                memberFor('a', { spec: specFor(99_900) }),
            ]);
            expect(sizedLow).toStrictEqual(sizedHigh);
            expect(unsizedLow).not.toStrictEqual(unsizedHigh);
        });

        it('caps every member at its own plan contract limit', () => {
            const plan = findFirm(FirmId.Mffu)?.findPlan(PLAN_ID);
            const positionSizing = resolvePositionSizing(
                InstrumentSymbol.ES,
                2,
            );
            if (!plan || positionSizing === null) {
                throw new Error('expected the MFF plan and an ES sizing');
            }
            const limit = fundedStartContractLimit(plan, positionSizing);
            if (limit === null) {
                throw new Error('expected a funded contract limit');
            }
            const contractRiskCents = Math.round(
                oneContractRisk(positionSizing) * CENTS_PER_DOLLAR,
            );
            const atContracts = (contracts: number) =>
                simulatedGroup([
                    sizedMember('a', contracts * contractRiskCents, 2),
                ]);
            const belowLimit = atContracts(limit - 1);
            const justOver = atContracts(limit + 5);
            const farOver = atContracts(limit + 15);
            expect(justOver).toStrictEqual(farOver);
            expect(belowLimit).not.toStrictEqual(farOver);
        });

        it('turns an unusable stop distance into a typed Failed outcome instead of silently dropping position sizing', () => {
            const unusable = {
                ...enginePolicyFor(),
                instrument: InstrumentSymbol.ES,
                stopPoints: 0,
            };
            const member = memberFor('a', {
                spec: { ...specFor(), enginePolicy: unusable },
            });
            const outcome = simulateGroupOutcomeOf(requestFor([member]));
            expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
        });

        it('applies each member own lifetime payout cap from its policy', () => {
            const capped = withPolicy('capped', {
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedCountTrigger,
                lifetimePayoutCapOverride: 1,
            });
            const result = simulatedGroup([capped, memberFor('free')], 300);
            const [cappedOutcome, freeOutcome] = result.memberOutcomes;
            if (cappedOutcome === undefined || freeOutcome === undefined) {
                throw new Error('expected two member outcomes');
            }
            const cappedCount = cappedOutcome.expectedPayoutCount.value;
            expect(cappedCount).toBeLessThanOrEqual(1);
            expect(freeOutcome.expectedPayoutCount.value).toBeGreaterThan(
                cappedCount,
            );
        });
    });

    describe('the shared simulation basis', () => {
        it('fails loud when members disagree on the win rate, since they cannot share one outcome stream', () => {
            const disagreeing = memberFor('b', {
                spec: specFor(DEFAULT_RISK_CENTS, {}, { winrate: 0.55 }),
            });
            const outcome = simulateGroupOutcomeOf(
                requestFor([memberFor('a'), disagreeing]),
            );
            expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
            if (outcome.kind !== CopyGroupWorkerOutcomeKind.Failed) return;
            expect(outcome.reason).toMatch(/win rate/i);
        });

        it('fails loud when members disagree on the funded horizon', () => {
            const outcome = simulateGroupOutcomeOf(
                requestFor([
                    memberFor('a'),
                    withPolicy('b', { fundedHorizonDays: 30 }),
                ]),
            );
            expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
            if (outcome.kind !== CopyGroupWorkerOutcomeKind.Failed) return;
            expect(outcome.reason).toMatch(/horizon/i);
        });

        it('reads the funded horizon from the member policy', () => {
            const short = simulatedGroup(
                [withPolicy('a', { fundedHorizonDays: 1 })],
                100,
            );
            const long = simulatedGroup(
                [withPolicy('a', { fundedHorizonDays: 60 })],
                100,
            );
            expect(long.pAnyBust.value).toBeGreaterThan(short.pAnyBust.value);
        });
    });

    it('turns an unresolvable plan into a typed Failed outcome, never a thrown error', () => {
        const outcome = simulateGroupOutcomeOf(
            requestFor([
                memberFor('missing-plan', {
                    planSerial: UNREGISTERED_PLAN_SERIAL,
                }),
            ]),
        );
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Failed);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Failed) return;
        expect(outcome.reason.length).toBeGreaterThan(0);
    });
});
