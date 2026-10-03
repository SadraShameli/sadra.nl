import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    points,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    EngineInputsRefusalKind,
    EngineOptimumRowKind,
    FundedSizingAdvisor,
    type FundedSweepFreshRequest,
    FundedSweepOptimumResultKind,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type PayoutSizeSweepRequest,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import { documentedFundedRisk } from '~/lib/prop-calculator/advisor/policy';
import { DEFAULT_FUNDED_FLAT_CANDIDATES } from '~/lib/prop-calculator/optimize';

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function account(): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    const tradingPlan = plan();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan: tradingPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function accountState(): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function advisorWith(
    caps: Partial<PersonalCaps>,
    personalDll: Dollars | null = null,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: account(),
        fundedHorizonDays: 252,
        personalCaps: { ...NO_PERSONAL_CAPS, ...caps },
        personalDll,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function freshRequestOf(advisor: FundedSizingAdvisor): FundedSweepFreshRequest {
    const found = advisor
        .optimumRequests()
        .find(
            (request): request is FundedSweepFreshRequest =>
                request.source === AdviceSource.FundedSweepFresh,
        );
    if (found === undefined) throw new Error('expected a fresh funded sweep');
    return found;
}

function payoutRequestOf(advisor: FundedSizingAdvisor): PayoutSizeSweepRequest {
    const found = advisor
        .optimumRequests()
        .find(
            (request): request is PayoutSizeSweepRequest =>
                request.source === AdviceSource.PayoutSizeSweep,
        );
    if (found === undefined) throw new Error('expected a payout size sweep');
    return found;
}

function personalCapReasons(advisor: FundedSizingAdvisor) {
    return advisor
        .assemble([])
        .differenceReasons.flatMap((reason) =>
            reason.kind === DifferenceReason.PersonalCap ? [reason] : [],
        );
}

function plan(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan(TOPSTEP_ID);
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

describe('the funded advisor carries the personal limits into every engine request (PT-68f, F-V16)', () => {
    it('puts the personal caps and the personal daily loss limit on the policy of the sweeps and the payout-size spec', () => {
        const caps: PersonalCaps = {
            dailyProfitCap: dollars(700),
            maxRiskPerTrade: dollars(250),
            maxTradesPerDay: 3,
        };
        const advisor = advisorWith(caps, dollars(600));

        for (const request of advisor.optimumRequests()) {
            const policy =
                request.source === AdviceSource.PayoutSizeSweep
                    ? request.spec.enginePolicy
                    : 'policy' in request
                      ? request.policy
                      : null;
            if (policy === null) continue;
            expect(policy.personalCaps).toEqual(caps);
            expect(policy.personalDll).toBe(600);
        }
        expect(payoutRequestOf(advisor).spec.enginePolicy.personalDll).toBe(
            600,
        );
        expect(freshRequestOf(advisor).policy.personalCaps).toEqual(caps);
    });

    it('leaves the policy free of personal limits when none is set', () => {
        const { policy } = freshRequestOf(advisorWith({}));

        expect('personalCaps' in policy).toBe(false);
        expect('personalDll' in policy).toBe(false);
    });
});

function flatCandidatesFor(maxRisk: Dollars | null): readonly number[] {
    const advisor = advisorWith({ maxRiskPerTrade: maxRisk });
    return freshRequestOf(advisor).candidates.flat ?? [];
}

describe('the funded sweep candidates stop at the personal max risk per trade (PT-68f, F-V16)', () => {
    it('keeps the flat candidates at or below the cap, and the cap itself when it sits between two', () => {
        expect(flatCandidatesFor(dollars(250))).toEqual([150, 200, 250]);
        expect(flatCandidatesFor(dollars(275))).toEqual([150, 200, 250, 275]);
    });

    it('sweeps the cap itself when it is below every default candidate', () => {
        expect(flatCandidatesFor(dollars(120))).toEqual([120]);
    });

    it('keeps the default candidates when the cap is above all of them or unset', () => {
        expect(flatCandidatesFor(dollars(900))).toEqual(
            DEFAULT_FUNDED_FLAT_CANDIDATES,
        );
        expect(flatCandidatesFor(null)).toEqual(DEFAULT_FUNDED_FLAT_CANDIDATES);
    });

    it('names the cap as a difference reason when a candidate was removed, and only then', () => {
        const reason = {
            cap: dollars(250),
            kind: DifferenceReason.PersonalCap,
        } as const;
        const capped = advisorWith({ maxRiskPerTrade: dollars(250) });
        const loose = advisorWith({ maxRiskPerTrade: dollars(900) });

        expect(personalCapReasons(capped)).toEqual([reason]);
        expect(differenceReasonText(reason)).toContain('$250.00');
        expect(personalCapReasons(loose)).toEqual([]);
        expect(personalCapReasons(advisorWith({}))).toEqual([]);
    });

    it('never simulates a flat row above the cap: the sweep rows are the bounded candidates', () => {
        const advisor = advisorWith({ maxRiskPerTrade: dollars(250) });
        const result = runEngineOptimum(plan(), freshRequestOf(advisor));

        if (
            result.source !== AdviceSource.FundedSweepFresh ||
            result.sweep.kind !== FundedSweepOptimumResultKind.Optimum
        ) {
            throw new Error('expected a fresh funded sweep optimum');
        }
        const labels = result.sweep.optimum.rows
            .filter((row) => row.kind === EngineOptimumRowKind.Placed)
            .map((row) => row.label);
        expect(labels).toEqual(
            expect.arrayContaining(['flat $150', 'flat $200', 'flat $250']),
        );
        expect(labels).not.toContain('flat $300');
        expect(labels).not.toContain('flat $500');
    });
});

function refusalIssuesAt(
    maxRisk: Dollars | null,
): readonly EngineInputsRefusalKind[] {
    const advisor = new FundedSizingAdvisor({
        account: account(),
        fundedHorizonDays: 252,
        personalCaps: { ...NO_PERSONAL_CAPS, maxRiskPerTrade: maxRisk },
        positionSizing: {
            instrument: InstrumentSymbol.NQ,
            stopPoints: points(10),
        },
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
    return advisor
        .assemble([])
        .differenceReasons.flatMap((reason) =>
            reason.kind === DifferenceReason.EngineInputsRefused
                ? [reason.refusal]
                : [],
        );
}

describe('the funded placement check reads the capped funded risk (PT-68f, F-V16)', () => {
    it('reports a placement below one contract when the personal max risk sits under one contract at the stop', () => {
        expect(refusalIssuesAt(dollars(150))).toContain(
            EngineInputsRefusalKind.FlatBelowOneContract,
        );
    });

    it('reports nothing when the rulebook risk and the cap both place a whole contract', () => {
        expect(refusalIssuesAt(null)).toEqual([]);
        expect(refusalIssuesAt(dollars(250))).toEqual([]);
    });
});

describe('the funded sweep stays ordered and bounded at the personal max risk (PT-68g, F-V16)', () => {
    it('keeps the flat candidates ascending and none above the cap when the cap sits within rounding noise below a default candidate', () => {
        const cap = 150 - 1e-9;
        const flats = flatCandidatesFor(dollars(cap));

        expect(flats).toEqual(flats.toSorted((a, b) => a - b));
        expect(Math.max(...flats)).toBeLessThanOrEqual(cap);
        expect(flats).toEqual([cap]);
    });

    it('keeps every candidate list ascending for each cap between and around the defaults', () => {
        for (const cap of [
            90,
            120,
            150,
            150 - 1e-9,
            150 + 1e-9,
            175,
            200 - 1e-9,
            275,
            900,
        ]) {
            const flats = flatCandidatesFor(dollars(cap));

            expect(flats).toEqual(flats.toSorted((a, b) => a - b));
            expect(new Set(flats).size).toBe(flats.length);
        }
    });

    it('names the limit in the personal cap reason text', () => {
        expect(
            differenceReasonText({
                cap: dollars(150),
                kind: DifferenceReason.PersonalCap,
            }),
        ).toBe('Capped by your personal max risk per trade of $150.00.');
    });

    it('builds the sweep base at the capped funded risk, the one the engine places', () => {
        const capped = freshRequestOf(
            advisorWith({ maxRiskPerTrade: dollars(100) }),
        );
        const loose = freshRequestOf(
            advisorWith({ maxRiskPerTrade: dollars(5000) }),
        );
        const plain = freshRequestOf(advisorWith({}));

        expect(capped.base.riskPerTrade).toBe(
            documentedFundedRisk(DEFAULT_RULEBOOK, capped.policy),
        );
        expect(capped.base.riskPerTrade).toBe(100);
        expect(loose.base.riskPerTrade).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR,
        );
        expect(plain.base.riskPerTrade).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR,
        );
    });
});
