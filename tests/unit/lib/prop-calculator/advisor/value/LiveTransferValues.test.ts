import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type EnginePolicy,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutSizeSweepResultKind,
    type ReconstructedFundedOrEvalAccount,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';
import { assumptionText } from '~/lib/prop-calculator/advisor';
import {
    fundedValueEstimate,
    payoutStakeComparison,
    retireComparison,
    riskCandidateValues,
    valueAtState,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import {
    type AccountState,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { type Fraction0to1 } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    LiveTransferContinuationKind,
    liveTransferHazardLines,
} from '~/lib/prop-calculator/simulator';

function fundedAccount(
    plan: Plan,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    Object.assign(state, overrides);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function specOf(
    plan: Plan,
    hazards: Partial<Record<FirmId, number>>,
    overrides: Partial<EnginePolicy> = {},
): DocumentedPolicySpec {
    return {
        enginePolicy: {
            ...buildEnginePolicy({
                fundedHorizonDays: 90,
                plan,
                rulebook: DEFAULT_RULEBOOK,
            }).policy,
            ...overrides,
        },
        rulebook: {
            ...DEFAULT_RULEBOOK,
            liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
        },
        run: { maxEvalDays: 40, seed: 5, trials: 60 },
    };
}

const SIZED = { instrument: InstrumentSymbol.MNQ, stopPoints: 10 } as const;
const MFFU_30 = { [FirmId.Mffu]: 0.3 };
const APEX_30 = { [FirmId.Apex]: 0.3 };

describe('every value run priced with the rulebook hazard carries a typed assumption (PT-73d step 1, 2)', () => {
    it('valueAtState names the hazard, the continuation and the share of runs sent live', () => {
        const plan = rapidEodPlan();
        const outcome = valueAtState(
            fundedAccount(plan, { balance: 50_800 }),
            specOf(plan, MFFU_30, SIZED),
        );
        if (outcome.kind !== ValueResultKind.Value) {
            throw new Error('expected a value result');
        }

        expect(outcome.liveTransfer).toMatchObject({
            continuation: LiveTransferContinuationKind.Modeled,
            hazard: 0.3,
            kind: AssumptionKind.LiveTransferHazard,
        });
        expect(outcome.liveTransfer?.sentLiveShare).toBeGreaterThan(0);
        expect(outcome.liveTransfer?.sentLiveShare).toBeLessThanOrEqual(1);
        const { liveTransfer } = outcome;
        if (liveTransfer === undefined) throw new Error('expected a hazard');
        const share = liveTransfer.sentLiveShare ?? 0;
        expect(assumptionText(liveTransfer)).toBe(
            liveTransferHazardLines(
                plan,
                0.3 as Fraction0to1,
                SIZED.instrument,
                SIZED.stopPoints,
                share,
            ).join(' '),
        );
    });

    it('valueAtState says nothing for a firm without a hazard, and stays byte-identical', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });
        const none = valueAtState(account, specOf(plan, {}, SIZED));
        const other = valueAtState(account, specOf(plan, APEX_30, SIZED));

        expect('liveTransfer' in none).toBe(false);
        expect(other).toStrictEqual(none);
    });

    it('fundedValueEstimate carries it too', () => {
        const plan = rapidEodPlan();
        const priced = fundedValueEstimate(plan, specOf(plan, MFFU_30), null);
        const none = fundedValueEstimate(plan, specOf(plan, {}), null);

        expect(priced.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect(priced.liveTransfer?.sentLiveShare).toBeGreaterThan(0);
        expect('liveTransfer' in none).toBe(false);
    });

    it('the retire comparison names the hazard on the keep run and on the replacement slot rate', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });
        const request = { isCapacityBound: false, replacementPlan: plan };
        const priced = retireComparison(
            account,
            specOf(plan, MFFU_30),
            request,
        );
        const none = retireComparison(account, specOf(plan, {}), request);
        if ('kind' in priced || 'kind' in none) {
            throw new Error('expected a retire comparison');
        }

        expect(priced.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect(priced.replacementLiveTransfer).toMatchObject({ hazard: 0.3 });
        expect('liveTransfer' in none).toBe(false);
        expect('replacementLiveTransfer' in none).toBe(false);
    });

    it('the retire comparison says the validated DP slot rate prices no hazard while the keep run does', () => {
        const plan = rapidEodPlan();
        const request = {
            isCapacityBound: false,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: 10 },
        };
        const account = fundedAccount(plan, { balance: 50_800 });
        const priced = retireComparison(
            account,
            specOf(plan, MFFU_30),
            request,
        );
        const none = retireComparison(account, specOf(plan, {}), request);
        const simulated = retireComparison(account, specOf(plan, MFFU_30), {
            isCapacityBound: false,
            replacementPlan: plan,
        });
        if ('kind' in priced || 'kind' in none || 'kind' in simulated) {
            throw new Error('expected a retire comparison');
        }

        expect(priced.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect('replacementLiveTransfer' in priced).toBe(false);
        expect(priced.isSlotRateHazardFree).toBe(true);
        expect('isSlotRateHazardFree' in none).toBe(false);
        expect('isSlotRateHazardFree' in simulated).toBe(false);
    });

    it('the risk candidates carry the hazard on the result and on every swing', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });
        const priced = riskCandidateValues(account, specOf(plan, MFFU_30), {
            riskGrid: [150, 250],
            rr: 2,
        });
        const none = riskCandidateValues(account, specOf(plan, {}), {
            riskGrid: [150, 250],
            rr: 2,
        });
        if (
            priced.kind !== ValueResultKind.Candidates ||
            none.kind !== ValueResultKind.Candidates
        ) {
            throw new Error('expected candidates');
        }

        expect(priced.liveTransfer).toMatchObject({
            hazard: 0.3,
            sentLiveShare: null,
        });
        for (const row of priced.rows) {
            expect(row.swing.afterWin.liveTransfer).toMatchObject({
                hazard: 0.3,
            });
        }
        expect('liveTransfer' in none).toBe(false);
    });

    it('the payout stake comparison carries it on the continue-now run', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 53_000 });
        const priced = payoutStakeComparison(account, specOf(plan, MFFU_30));
        const none = payoutStakeComparison(account, specOf(plan, {}));
        if (
            priced.kind !== ValueResultKind.PayoutStake ||
            none.kind !== ValueResultKind.PayoutStake
        ) {
            throw new Error('expected a payout stake comparison');
        }

        expect(priced.continueNow.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect('liveTransfer' in none.continueNow).toBe(false);
    });

    it('the payout-size sweep carries it on the optimum', () => {
        const plan = rapidEodPlan();
        const run = (hazards: Partial<Record<FirmId, number>>) =>
            runPayoutSizeSweep(plan, {
                source: AdviceSource.PayoutSizeSweep,
                spec: specOf(plan, hazards),
            });
        const priced = run(MFFU_30);
        const none = run({});
        if (
            priced.kind !== PayoutSizeSweepResultKind.Optimum ||
            none.kind !== PayoutSizeSweepResultKind.Optimum
        ) {
            throw new Error('expected an optimum');
        }

        expect(priced.optimum.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect(priced.optimum.liveTransfer?.sentLiveShare).toBeGreaterThan(0);
        expect('liveTransfer' in none.optimum).toBe(false);
    });
});
