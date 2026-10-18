import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    enginePolicyKey,
    EvalSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
    SizingObjective,
    SizingProvenance,
    SpeedObjective,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(APEX_EOD_ID);

function account(
    overrides: Partial<ReconstructedFundedOrEvalAccount> = {},
): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...overrides,
        ...NO_PENDING_PAYOUT_COUNTS,
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

function advisorAt(
    reconstructed: ReconstructedFundedOrEvalAccount,
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: reconstructed,
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

describe('EvalSizingAdvisor (PT-19f, F-118, F-119, F-120)', () => {
    it("documents the general-derivation ladder by default, sized within the plan's own cushion and daily-loss room", () => {
        const advisor = advisorAt(account());

        const documented = advisor.documented();

        expect(documented?.provenance).toBe(SizingProvenance.GeneralDerivation);
        expect(documented?.rewardMultiple).toBe(DEFAULT_RULEBOOK.strategy.rr);
        expect(documented?.maxTrades).toBe(
            DEFAULT_RULEBOOK.strategy.tradesPerDayMax,
        );
        const rungs = documented?.rungs ?? [];
        expect(rungs.length).toBeGreaterThan(0);
        expect(
            rungs.reduce((sum, rung) => sum + rung.risk, 0),
        ).toBeLessThanOrEqual(2000);
    });

    it('caps the running loss with PersonalCap under a personal DLL of $300', () => {
        const advisorWithPersonalDll = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            personalDll: dollars(300),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        });

        const documented = advisorWithPersonalDll.documented();

        expect(
            documented?.rungs.some((rung) =>
                rung.cappedBy.includes(SizingConstraint.PersonalCap),
            ),
        ).toBe(true);
        expect(
            documented?.rungs.reduce((sum, rung) => sum + rung.risk, 0),
        ).toBeLessThanOrEqual(300);
    });

    it('documents no eval rung above the trader personal max risk per trade (PT-68d, F-V16)', () => {
        const uncapped = advisorAt(account()).documented();
        const advisor = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            personalCaps: {
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(120),
            },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        });

        const documented = advisor.documented();

        expect(
            Math.max(...(uncapped?.rungs ?? []).map((rung) => rung.risk)),
        ).toBeGreaterThan(120);
        const rungs = documented?.rungs ?? [];
        expect(rungs.length).toBeGreaterThan(0);
        for (const rung of rungs) {
            expect(rung.risk).toBeLessThanOrEqual(120);
        }
        expect(documented?.constraints).toContain(SizingConstraint.PersonalCap);
    });

    it('caps() reports the affordable room and the personal caps passed through', () => {
        const advisor = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            personalCaps: {
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(120),
            },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        });

        const caps = advisor.caps();

        expect(caps.affordable).toBeGreaterThan(0);
        expect(caps.maxRiskPerTrade).toBe(120);
    });

    it('requests LadderSearchFresh at elapsedDays 0, bounded to a browser-safe grid size', () => {
        const advisor = advisorAt(account());

        const [request] = advisor.optimumRequests();

        expect(request?.source).toBe(AdviceSource.LadderSearchFresh);
        if (request?.source !== AdviceSource.LadderSearchFresh) return;
        expect(request.maxGridSize).toBeDefined();
        expect(request.maxGridSize ?? Infinity).toBeLessThanOrEqual(2000);
    });

    it('requests LadderSearchFromState once elapsedDays is above 0, carrying the start state', () => {
        const advisor = advisorAt(
            account({ state: accountState({ elapsedDays: 3 }) }),
        );

        const [request] = advisor.optimumRequests();

        expect(request?.source).toBe(AdviceSource.LadderSearchFromState);
        if (request?.source !== AdviceSource.LadderSearchFromState) return;
        expect(request.score.startState?.elapsedDays).toBe(3);
    });

    it('assemble() reports a fresh start basis at elapsedDays 0 and from-state otherwise', () => {
        const fresh = advisorAt(account()).assemble([]);
        const fromState = advisorAt(
            account({ state: accountState({ elapsedDays: 5 }) }),
        ).assemble([]);

        expect(fresh.provenance.startBasis).toBe(StartBasis.Fresh);
        expect(fromState.provenance.startBasis).toBe(StartBasis.FromState);
    });

    it('assemble() carries the real firm-data verification date and any given plan-rules fingerprint (F-126)', () => {
        const advice = advisorAt(account()).assemble([]);

        expect(advice.provenance.firmDataDate).toBe(
            firmDataProvenance(FirmId.Apex).verifiedOn,
        );
        expect(advice.provenance.planRulesFingerprint).toBeNull();

        const withFingerprint = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            planRulesFingerprint: { atAdvice: 'old-hash', current: 'new-hash' },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        }).assemble([]);

        expect(withFingerprint.provenance.planRulesFingerprint).toBe(
            'new-hash',
        );
    });
});

describe('EvalSizingAdvisor (PT-104: objective, live triggers, engine policy)', () => {
    it('names speed to funded as the objective of a ladder-sourced advice, not monthly net (F-126)', () => {
        const advice = advisorAt(account()).assemble([]);

        expect(advice.provenance.source).toBe(AdviceSource.LadderSearchFresh);
        expect(advice.provenance.objective).toBe(SpeedObjective.SpeedToFunded);
        expect(advice.provenance.objective).not.toBe(
            SizingObjective.MonthlyNet,
        );
    });

    it('lists that live triggers were not checked, as the funded and live advice do (F-125)', () => {
        const advice = advisorAt(account()).assemble([]);

        expect(
            advice.assumptions.filter(
                (assumption) =>
                    assumption.kind === AssumptionKind.LiveTriggersNotChecked,
            ),
        ).toHaveLength(1);
    });

    it('carries the engine policy built for this plan and rulebook on the ladder request (F-118)', () => {
        const advisor = advisorAt(account());

        const [request] = advisor.optimumRequests();

        if (request?.source !== AdviceSource.LadderSearchFresh) {
            throw new Error('expected a fresh ladder request');
        }
        expect(request.policy).toStrictEqual(
            buildEnginePolicy({
                fundedHorizonDays: request.policy.fundedHorizonDays,
                plan,
                rulebook: DEFAULT_RULEBOOK,
            }).policy,
        );
    });

    it('changes the ladder request policy with the measured rebuy lag and the retained cushion', () => {
        const baseKey = policyKeyOf(advisorAt(account()));
        const laggedKey = policyKeyOf(
            new EvalSizingAdvisor({
                account: account(),
                maxEvalDays: 150,
                measuredRebuyLag: { days: 3, samples: 5 },
                rulebook: DEFAULT_RULEBOOK,
                snapshotAsOf: '2026-09-26',
                substate: null,
                today: '2026-09-26',
            }),
        );
        const retainedKey = policyKeyOf(
            new EvalSizingAdvisor({
                account: account(),
                maxEvalDays: 150,
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        retainedCushionCents: 400_000,
                    },
                },
                snapshotAsOf: '2026-09-26',
                substate: null,
                today: '2026-09-26',
            }),
        );

        expect(laggedKey).not.toBe(baseKey);
        expect(retainedKey).not.toBe(baseKey);
    });
});

describe('EvalSizingAdvisor staleness (PT-104, F-141)', () => {
    it('is stale with no documented sizing or daily plan when the snapshot is two sessions old', () => {
        const advisor = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-21',
            substate: null,
            today: '2026-09-23',
        });

        expect(advisor.documented()).toBeNull();
        expect(advisor.dailyPlanCard()).toBeNull();
        expect(advisor.assemble([]).differenceReasons).toContainEqual({
            kind: DifferenceReason.StaleAdvice,
            snapshotDate: '2026-09-21',
        });
    });

    it('is fresh when the snapshot is one session old', () => {
        const advisor = new EvalSizingAdvisor({
            account: account(),
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-22',
            substate: null,
            today: '2026-09-23',
        });

        expect(advisor.documented()).not.toBeNull();
        expect(
            advisor
                .assemble([])
                .differenceReasons.some(
                    (reason) => reason.kind === DifferenceReason.StaleAdvice,
                ),
        ).toBe(false);
    });
});

function policyKeyOf(advisor: EvalSizingAdvisor): string {
    const [request] = advisor.optimumRequests();
    if (request?.source !== AdviceSource.LadderSearchFresh) {
        throw new Error('expected a fresh ladder request');
    }
    return enginePolicyKey(request.policy);
}
