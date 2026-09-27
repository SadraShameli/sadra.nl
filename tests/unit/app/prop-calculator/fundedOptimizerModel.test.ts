import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type FundedOptimizerCalculatorInputs,
    fundedOptimizerPolicyBasis,
    fundedOptimizerRequest,
    fundedOptimizerRows,
    fundedOptimizerSweep,
    FundedPolicyBasis,
    fundedSweepPlan,
    PERCENT_CANDIDATES_NEED_STOP_NOTE,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    InstrumentSymbol,
    resolvePositionSizing,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';
import {
    buildFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    FundedCandidateBuildKind,
    FundedSortKey,
    runFundedCandidateSweep,
} from '~/lib/prop-calculator/optimize';

function requireDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

function requirePlan(value: null | Plan, message: string): Plan {
    if (value === null) throw new Error(message);
    return value;
}

const TOPSTEP: TradingFirm = requireDefined(
    findFirm(FirmId.TopStep),
    'expected the TopStep firm to be registered',
);
const TOPSTEP_50K = requirePlan(
    TOPSTEP.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

function baseInputs(): FundedOptimizerCalculatorInputs {
    const state = defaultCalculatorState();
    return { ...state, plan: TOPSTEP_50K };
}

describe('fundedOptimizerRequest (Q30)', () => {
    it('carries the rulebook retained cushion, never $0, when the calculator cushion is null', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.policy.retainedCushionRequest).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents / CENTS_PER_DOLLAR,
        );
        expect(request.policy.retainedCushionRequest).toBeGreaterThan(0);
    });

    it('prefers the calculator cushion over the rulebook default when set', () => {
        const request = fundedOptimizerRequest(
            { ...baseInputs(), retainedCushion: 3500 },
            DEFAULT_RULEBOOK,
        );
        expect(request.policy.retainedCushionRequest).toBe(3500);
    });

    it('falls back to the rulebook payout request size when the calculator has none', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.base.payoutRequestSize).toBe(
            DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
        );
    });

    it('carries the plan serial and opt-ins so the worker can rebuild the plan', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.firmId).toBe(FirmId.TopStep);
        expect(request.planSerial).toBe(serializePlanId(TOPSTEP_50K.id));
        expect(request.optIns).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
    });
});

describe('fundedOptimizerPolicyBasis (PT-25b review)', () => {
    it('reports the rulebook default for both cushion and payout request when the calculator has neither', () => {
        const basis = fundedOptimizerPolicyBasis(baseInputs());
        expect(basis.cushion).toBe(FundedPolicyBasis.RulebookDefault);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.RulebookDefault);
    });

    it('reports a calculator override for the cushion when the calculator sets one', () => {
        const basis = fundedOptimizerPolicyBasis({
            ...baseInputs(),
            retainedCushion: 3500,
        });
        expect(basis.cushion).toBe(FundedPolicyBasis.CalculatorOverride);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.RulebookDefault);
    });

    it('reports a calculator override for the payout request when the calculator sets one', () => {
        const basis = fundedOptimizerPolicyBasis({
            ...baseInputs(),
            payoutRequestSize: 750,
        });
        expect(basis.cushion).toBe(FundedPolicyBasis.RulebookDefault);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.CalculatorOverride);
    });
});

describe('fundedOptimizerSweep', () => {
    it('matches building the CLI candidates and sweeping them directly for the same plan, seed and policy', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = fundedSweepPlan(request);
        if (plan === null) throw new Error('expected a resolvable plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }

        const positionSizing = resolvePositionSizing(
            InstrumentSymbol.NQ,
            7.5,
        );
        const build = buildFundedCandidates({
            flat: DEFAULT_FUNDED_FLAT_CANDIDATES,
            fundedLadder: null,
            percent: undefined,
            plan,
            positionSizing,
            stopRule: inputs.dayStop,
        });
        if (build.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected the reference build to succeed too');
        }
        const referenceBase = applyEnginePolicy(plan, request.policy, {
            ...request.base,
            plan,
        });
        const referenceRows = runFundedCandidateSweep(
            referenceBase,
            build.candidates,
            FundedSortKey.Monthly,
        );

        const actualRows = fundedOptimizerRows(
            result.rows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        const expectedRows = fundedOptimizerRows(
            referenceRows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        expect(actualRows).toEqual(expectedRows);
        expect(actualRows.length).toBeGreaterThan(0);
    });

    it('sorts by both FundedSortKey values', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(fundedSweepPlan(request), 'expected the built request to resolve a plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        for (const sort of [FundedSortKey.Monthly, FundedSortKey.Cycle]) {
            const rows = fundedOptimizerRows(result.rows, sort, request.base.trials);
            expect(rows.length).toBe(result.rows.length);
            for (const row of rows) {
                expect(row.cells.length).toBeGreaterThan(0);
            }
        }
    });

    it('gives each row a standard error from the estimates', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(fundedSweepPlan(request), 'expected the built request to resolve a plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        const rows = fundedOptimizerRows(
            result.rows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        for (const row of rows) {
            expect(row.monthlyNetStandardError).not.toBeNull();
        }
    });

    it('leaves out percent rows with a note when no instrument or stop is chosen', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        const plan = requirePlan(fundedSweepPlan(request), 'expected the built request to resolve a plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        expect(result.notes).toContain(PERCENT_CANDIDATES_NEED_STOP_NOTE);
        for (const row of result.rows) {
            expect(row.candidate.label).not.toContain('% cushion');
        }
    });

    it('leaves out flat candidates below one contract, with the lifted note', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 750,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(fundedSweepPlan(request), 'expected the built request to resolve a plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        expect(result.rows.length).toBeLessThan(
            DEFAULT_FUNDED_FLAT_CANDIDATES.length,
        );
        expect(
            result.notes.some((note) => note.includes('left out')),
        ).toBe(true);
    });

    it('clamps trials to the stated maximum', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            trials: 999_999,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        expect(request.base.trials).toBeLessThan(999_999);
    });
});

function withRulebookPayout(
    rulebook: RulebookParameters,
    requestCents: number,
): RulebookParameters {
    return {
        ...rulebook,
        payout: { ...rulebook.payout, requestCents },
    };
}

describe('fundedOptimizerRequest with a custom rulebook', () => {
    it('uses the rulebook payout request size, not a hardcoded $500', () => {
        const rulebook = withRulebookPayout(DEFAULT_RULEBOOK, 75_000);
        const request = fundedOptimizerRequest(baseInputs(), rulebook);
        expect(request.base.payoutRequestSize).toBe(750);
    });
});
