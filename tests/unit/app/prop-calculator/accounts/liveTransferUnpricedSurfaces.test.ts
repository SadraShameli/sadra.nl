import { describe, expect, it } from 'vitest';

import {
    type CopyGroupWorkerMember,
    CopyGroupWorkerOutcomeKind,
    simulateGroupOutcomeOf,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import {
    type AccountState,
    findFirm,
    FirmId,
    type FundedCycleSeed,
    MffuVariant,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    runNextPayoutProjection,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const PLAN = rapidEodPlan();

function fundedState(): AccountState {
    return {
        balance: 50_400,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 3,
        startingBalance: 50_000,
        threshold: 47_500,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 3,
    };
}

function seedOf(): FundedCycleSeed {
    return {
        calendarDayGateProgress: 0,
        cumulativePayout: 0,
        cycleBestDayProfit: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: 50_000,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: 0,
    };
}

function specOf(
    hazards: Partial<Record<FirmId, number>>,
): DocumentedPolicySpec {
    return {
        enginePolicy: buildEnginePolicy({
            fundedHorizonDays: 60,
            plan: PLAN,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        planSerial: serializePlanId(PLAN.id),
        rulebook: {
            ...DEFAULT_RULEBOOK,
            liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
        },
        run: { maxEvalDays: 30, seed: 3, trials: 50 },
    };
}

describe('the surfaces that do not price the rulebook live-transfer hazard stay unmoved by it (PT-73d pin)', () => {
    it('keeps the next-payout projection identical with a hazard entered: it stops at the first payout, before any transfer chance', () => {
        const projectionOf = (hazards: Partial<Record<FirmId, number>>) => {
            const spec = specOf(hazards);
            return runNextPayoutProjection(PLAN, {
                base: toSimInputs(PLAN, spec),
                policy: spec.enginePolicy,
                source: AdviceSource.NextPayoutProjection,
                start: {
                    phase: TradingPhase.Funded,
                    seed: seedOf(),
                    state: fundedState(),
                },
            });
        };

        expect(projectionOf({ [FirmId.Mffu]: 0.5 })).toStrictEqual(
            projectionOf({}),
        );
    });

    it('keeps a copy-group run identical with a hazard entered: the group simulation prices no live transfer', () => {
        const member = (
            hazards: Partial<Record<FirmId, number>>,
        ): CopyGroupWorkerMember => ({
            firmId: FirmId.Mffu,
            id: 'a',
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serializePlanId(PLAN.id),
            spec: specOf(hazards),
            start: {
                phase: TradingPhase.Funded,
                seed: seedOf(),
                state: fundedState(),
            },
        });
        const resultOf = (hazards: Partial<Record<FirmId, number>>) => {
            const outcome = simulateGroupOutcomeOf({
                members: [member(hazards)],
                seed: 42,
                trials: 80,
            });
            if (outcome.kind !== CopyGroupWorkerOutcomeKind.Simulated) {
                throw new Error(`expected a simulation, got ${outcome.kind}`);
            }
            return outcome.result;
        };

        expect(resultOf({ [FirmId.Mffu]: 0.5 })).toStrictEqual(resultOf({}));
    });
});
