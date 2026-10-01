import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import { type DocumentedPolicySpec, type EnginePolicy } from '~/lib/prop-calculator/advisor/policy';
import {
    continuationValue,
    RISK_CANDIDATE_LABEL,
    RiskCandidateBasis,
    riskCandidateValues,
} from '~/lib/prop-calculator/advisor/value/RiskCandidateValues';
import { TRADE_VALUE_SWING_ASSUMPTION } from '~/lib/prop-calculator/advisor/value/TradeValueSwing';
import { ValueResultKind } from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    type AccountState,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

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
    };
}

function liveAccount(plan: Plan): ReconstructedAccount {
    return {
        assumptions: [],
        cushion: null,
        kind: ReconstructedLiveKind.Live,
        livePlan: null,
        plan,
        state: null,
    };
}

function policyFor(plan: Plan, overrides: Partial<EnginePolicy> = {}): EnginePolicy {
    return {
        ...buildEnginePolicy({
            fundedHorizonDays: 90,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        ...overrides,
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

function specFor(plan: Plan, overrides: Partial<EnginePolicy> = {}): DocumentedPolicySpec {
    return {
        enginePolicy: policyFor(plan, overrides),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 5, trials: 30 },
    };
}

describe('continuationValue (syntheticVideoTree pin, PT-65a step 4)', () => {
    it('p 0.5 with 1,000 and 300 gives 650', () => {
        expect(continuationValue(0.5, 1000, 300)).toBe(650);
    });

    it('p 1/3 with 2,000 and 300 gives 866.7', () => {
        expect(continuationValue(1 / 3, 2000, 300)).toBeCloseTo(866.7, 1);
    });
});

describe('riskCandidateValues (F-V17, PT-65a step 4)', () => {
    it('ranks unsized candidates by continuation value net of the duration charge, with SEs, labelled and basis-tagged', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = riskCandidateValues(account, spec, {
            riskGrid: [150, 250, 400],
            rr: 2,
        });
        if (outcome.kind !== ValueResultKind.Candidates) {
            throw new Error('expected a candidates result');
        }

        expect(outcome.label).toBe(RISK_CANDIDATE_LABEL);
        expect(outcome.basis).toBe(RiskCandidateBasis.Simulator);
        expect(outcome.rows).toHaveLength(3);
        for (const row of outcome.rows) {
            expect(row.placement.contracts).toBeNull();
            expect(row.placement.placedRisk).toBe(row.placement.intendedRisk);
            expect(row.continuationValue.value).toBeCloseTo(
                continuationValue(
                    row.swing.winProbability,
                    row.swing.afterWin.creditInclusive.value,
                    row.swing.afterLoss.creditInclusive.value,
                ),
            );
        }
        const sorted = outcome.rows.toSorted(
            (a, b) => b.netOfDurationCharge - a.netOfDurationCharge,
        );
        expect(outcome.rows.map((row) => row.placement.intendedRisk)).toEqual(
            sorted.map((row) => row.placement.intendedRisk),
        );
    });

    it('places whole contracts when a stop is known (T33)', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = riskCandidateValues(account, spec, {
            riskGrid: [250],
            rr: 2,
        });
        if (outcome.kind !== ValueResultKind.Candidates) {
            throw new Error('expected a candidates result');
        }

        const [row] = outcome.rows;
        if (!row) throw new Error('expected a row');
        expect(row.placement.contracts).not.toBeNull();
        expect(row.placement.placedRisk).toBeLessThanOrEqual(250);
        expect(row.placement.placedRisk).toBeGreaterThan(0);
    });

    it('is not modeled for a live account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        expect(
            riskCandidateValues(account, spec, { riskGrid: [250], rr: 2 }),
        ).toStrictEqual({ kind: 'not-modeled', reason: 'live-not-modeled' });
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        expect(
            riskCandidateValues(account, spec, { riskGrid: [150, 250], rr: 2 }),
        ).toStrictEqual(
            riskCandidateValues(account, spec, { riskGrid: [150, 250], rr: 2 }),
        );
    });

    it('prices an eval account too, every row valued after a closed session with the boundary stated', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const state = plan.initialState();
        const account: ReconstructedFundedOrEvalAccount = {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: null,
            kind: TradingPhase.Eval,
            plan,
            resolvedDailyLossLimit: null,
            state: { ...state, balance: state.balance + 300, elapsedDays: 2, tradingDays: 2 },
        };

        const outcome = riskCandidateValues(account, spec, {
            riskGrid: [150, 250],
            rr: 2,
        });
        if (outcome.kind !== ValueResultKind.Candidates) {
            throw new Error('expected a candidates result');
        }

        expect(outcome.rows).toHaveLength(2);
        for (const row of outcome.rows) {
            expect(row.swing.assumption).toBe(TRADE_VALUE_SWING_ASSUMPTION);
            expect(Number.isFinite(row.continuationValue.value)).toBe(true);
        }
    });
});
