import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    capRiskToContractLimit,
    type ComputeRisk,
    contractLimitAt,
    FirmId,
    InstrumentSymbol,
    type Plan,
    type PlanId,
    resetForNewDay,
    resolvePositionSizing,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    createDocumentedRule,
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    LadderFractionSource,
    type RulebookParameters,
    ruleContextAt,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    DOCUMENTED_POLICY_DISCLOSURE_TEXT,
    documentedDayRisk,
    DocumentedPolicyDisclosure,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const EM_DASH = String.fromCodePoint(0x20_14);

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexIntraday = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});
const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 60,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

const MFF_FRACTIONS_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    eval: {
        ...DEFAULT_RULEBOOK.eval,
        ladderFractionSource: LadderFractionSource.MffRapidEodSearch,
    },
};

const MAX_RISK_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    eval: { ...DEFAULT_RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
};

function allLossDay(
    risk: ComputeRisk,
    state: AccountState,
    commission = 0,
): number[] {
    const risks: number[] = [];
    for (
        let index = 0;
        index < DEFAULT_RULEBOOK.strategy.tradesPerDayMax;
        index++
    ) {
        const next = risk(state, index);
        if (next <= 0) break;
        risks.push(next);
        trade(state, -next - commission);
    }
    return risks;
}

function didReachTargetToday(
    plan: Plan,
    risk: ComputeRisk,
    state: AccountState,
    commission: number,
): boolean {
    const { rr, tradesPerDayMax } = DEFAULT_RULEBOOK.strategy;
    resetForNewDay(state);
    for (let index = 0; index < tradesPerDayMax; index++) {
        const next = risk(state, index);
        if (next <= 0) return false;
        trade(state, rr * next - commission);
        if (plan.accountProfit(state) >= plan.profitTarget) return true;
    }
    return false;
}

function evalRisk(
    plan: Plan,
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
    policy: EnginePolicy = POLICY,
): ComputeRisk {
    return documentedDayRisk(plan, SizingStage.Eval, rulebook, policy);
}

function pastTarget(): AccountState {
    return stateAt(53_500, 51_500);
}

function stateAt(balance: number, threshold: number): AccountState {
    return { ...apexIntraday.initialState(), balance, threshold };
}

function trade(state: AccountState, netPnL: number): void {
    state.balance += netPnL;
    state.todayPnL += netPnL;
}

function winningDaysToTarget(
    plan: Plan,
    risk: ComputeRisk,
    state: AccountState,
    commission: number,
): number {
    for (let day = 1; day <= WALK_DAY_LIMIT; day++) {
        if (didReachTargetToday(plan, risk, state, commission)) return day;
    }
    return Infinity;
}

const WALK_DAY_LIMIT = 20;
const COMMISSION = 4.5;

describe('documentedDayRisk: general-derivation ladder (PT-48a)', () => {
    it('trades [400, 600, 900, 100] on an all-loss day at a $2,000 cushion', () => {
        const state = apexIntraday.initialState();

        expect(allLossDay(evalRisk(apexIntraday), state)).toEqual([
            400, 600, 900, 100,
        ]);
    });

    it('matches the rule itself at the day-start context', () => {
        const state = apexIntraday.initialState();
        const rule = createDocumentedRule(SizingStage.Eval, DEFAULT_RULEBOOK);
        const sizing = rule.size(
            ruleContextAt(apexIntraday, SizingStage.Eval, state, {
                instrument: null,
                personalDll: null,
            }),
        );

        expect(allLossDay(evalRisk(apexIntraday), state)).toEqual(
            sizing.rungs.map((rung) => rung.risk),
        );
    });

    it('returns 0 once a win turns the day green (the ladder stop rule)', () => {
        const state = apexIntraday.initialState();
        const risk = evalRisk(apexIntraday);

        expect(risk(state, 0)).toBe(400);
        trade(state, -400);
        expect(risk(state, 1)).toBe(600);
        trade(state, 1200);
        expect(risk(state, 2)).toBe(0);
    });
});

describe('documentedDayRisk: MFF search fractions', () => {
    it('trades [400, 600, 800, 200] on an all-loss day at a $2,000 cushion', () => {
        const state = apexIntraday.initialState();

        expect(
            allLossDay(evalRisk(apexIntraday, MFF_FRACTIONS_RULEBOOK), state),
        ).toEqual([400, 600, 800, 200]);
    });
});

describe('documentedDayRisk: max risk with the daily cap', () => {
    it('$2,000 cushion, $3,000 to target, rr 2: trade 0 risks $1,500', () => {
        const state = apexIntraday.initialState();

        expect(evalRisk(apexIntraday, MAX_RISK_RULEBOOK)(state, 0)).toBe(1500);
    });

    it('after a partial win caps the next trade at (ceiling - dayPnL) / rr', () => {
        const state = apexIntraday.initialState();
        const risk = evalRisk(apexIntraday, MAX_RISK_RULEBOOK);

        expect(risk(state, 0)).toBe(1500);
        trade(state, 1000);
        expect(risk(state, 1)).toBe((3000 - 1000) / 2);
    });

    it('returns 0 once dayPnL reaches the rulebook multiple times the first risk', () => {
        const state = stateAt(50_000, 49_000);
        const risk = evalRisk(apexIntraday, MAX_RISK_RULEBOOK);
        const firstRisk = risk(state, 0);
        const dailyCap =
            MAX_RISK_RULEBOOK.eval.maxRiskDailyCapMultiple * firstRisk;

        expect(firstRisk).toBe(1000);
        trade(state, dailyCap - 400);
        expect(risk(state, 1)).toBe(200);
        trade(state, 400);
        expect(risk(state, 2)).toBe(0);
    });
});

describe('documentedDayRisk: cumulative caps', () => {
    it('keeps an all-loss day inside the $1,000 day-start DLL room (Apex EOD eval)', () => {
        const state = apexEod.initialState();
        const risks = allLossDay(evalRisk(apexEod), state);

        expect(risks).toEqual([200, 300, 450, 50]);
        expect(risks.reduce((sum, value) => sum + value, 0)).toBe(1000);
    });

    it('caps each rung at (remaining target + running loss) / rr with $500 left', () => {
        const state = stateAt(52_500, 50_500);
        const risk = evalRisk(apexIntraday);

        expect(risk(state, 0)).toBe(250);
        trade(state, -250);
        expect(risk(state, 1)).toBe(350);
    });
});

describe('documentedDayRisk: day memo', () => {
    it('does not share a memo between two interleaved states', () => {
        const risk = evalRisk(apexIntraday);
        const wide = apexIntraday.initialState();
        const narrow = stateAt(50_000, 49_000);

        expect(risk(wide, 0)).toBe(400);
        expect(risk(narrow, 0)).toBe(200);
        trade(wide, -400);
        expect(risk(wide, 1)).toBe(600);
        trade(narrow, -200);
        expect(risk(narrow, 1)).toBe(300);
        trade(wide, -600);
        expect(risk(wide, 2)).toBe(900);
    });

    it('resets at trade index 0 of the next day, after an idle day too', () => {
        const risk = evalRisk(apexIntraday);
        const state = apexIntraday.initialState();

        expect(risk(state, 0)).toBe(400);
        trade(state, -400);
        expect(risk(state, 1)).toBe(600);
        trade(state, -600);
        resetForNewDay(state);
        resetForNewDay(state);

        expect(risk(state, 0)).toBe(200);
        trade(state, -200);
        expect(risk(state, 1)).toBe(300);
    });

    it('refuses a later trade index without its day start', () => {
        const risk = evalRisk(apexIntraday);
        const state = apexIntraday.initialState();

        expect(() => risk(state, 1)).toThrow(/trade index 1/);
        expect(risk(state, 0)).toBe(400);
        expect(() => risk(state, 2)).toThrow(/trade index 2/);
    });
});

describe('documentedDayRisk: commission', () => {
    it('reads progress from the gross trade, so a $4.50 commission never throws and never shrinks the next rung', () => {
        const policy = { ...POLICY, commissionPerRoundTrip: 4.5 };
        const state = apexIntraday.initialState();

        expect(
            allLossDay(
                evalRisk(apexIntraday, DEFAULT_RULEBOOK, policy),
                state,
                4.5,
            ),
        ).toEqual([400, 600, 900, 100]);
    });

    it('counts a win net of commission as a win', () => {
        const policy = { ...POLICY, commissionPerRoundTrip: 4.5 };
        const state = stateAt(50_000, 49_000);
        const risk = evalRisk(apexIntraday, MAX_RISK_RULEBOOK, policy);

        expect(risk(state, 0)).toBe(1000);
        trade(state, 1000 - 4.5);
        expect(risk(state, 1)).toBe((2000 - 1000) / 2);
    });
});

describe('documentedDayRisk: commission covers the target (review of F-148)', () => {
    const policy = { ...POLICY, commissionPerRoundTrip: COMMISSION };
    const roundingPad = DEFAULT_RULEBOOK.strategy.rr * 0.01;

    it('sizes a win from $4.50 left at $4.50 commission so it reaches the target net', () => {
        const state = stateAt(52_995.5, 50_995.5);
        const next = evalRisk(apexIntraday, DEFAULT_RULEBOOK, policy)(state, 0);

        trade(state, DEFAULT_RULEBOOK.strategy.rr * next - COMMISSION);

        expect(apexIntraday.accountProfit(state)).toBeGreaterThanOrEqual(
            apexIntraday.profitTarget,
        );
    });

    it.each([
        ['ladder', DEFAULT_RULEBOOK, apexIntraday],
        ['ladder with a DLL', DEFAULT_RULEBOOK, apexEod],
        ['max risk', MAX_RISK_RULEBOOK, apexIntraday],
    ] as const)(
        'walks winning days from the start to the target net of commission, %s',
        (_label, rulebook, plan) => {
            const withCommission = winningDaysToTarget(
                plan,
                evalRisk(plan, rulebook, policy),
                plan.initialState(),
                COMMISSION,
            );
            const withoutCommission = winningDaysToTarget(
                plan,
                evalRisk(plan, rulebook),
                plan.initialState(),
                0,
            );

            expect(withoutCommission).toBeLessThan(WALK_DAY_LIMIT);
            expect(withCommission).toBeLessThanOrEqual(withoutCommission + 1);
        },
    );

    it('walks from a cent short of the target through the post-target trade to the target', () => {
        const state = stateAt(52_999.99, 50_999.99);

        expect(
            winningDaysToTarget(
                apexIntraday,
                evalRisk(apexIntraday, DEFAULT_RULEBOOK, policy),
                state,
                COMMISSION,
            ),
        ).toBeLessThan(WALK_DAY_LIMIT);
    });

    it('covers the commission of every trade so far plus a cent of rounding at rr on a target-capped trade', () => {
        const state = stateAt(50_300, 48_300);
        const risk = evalRisk(apexIntraday, MAX_RISK_RULEBOOK, policy);

        expect(risk(state, 0)).toBeCloseTo(
            (2700 + COMMISSION + roundingPad) / 2,
            6,
        );
        trade(state, 1000 - COMMISSION);
        expect(risk(state, 1)).toBeCloseTo(
            (2700 + 2 * COMMISSION + roundingPad - 1000) / 2,
            6,
        );
    });

    it('leaves the zero-commission rungs exactly on the documented rule', () => {
        const state = stateAt(52_500, 50_500);

        expect(evalRisk(apexIntraday)(state, 0)).toBe(250);
    });

    it('is disclosed', () => {
        expect(
            DOCUMENTED_POLICY_DISCLOSURE_TEXT[
                DocumentedPolicyDisclosure.CommissionCoveredTarget
            ],
        ).toMatch(/commission/);
    });
});

describe('documentedDayRisk: whole-cent progress', () => {
    it('records a contract-capped loss at a stop off the cent grid in whole cents, so the next rung keeps its running-loss column', () => {
        const stopPoints = 10.1234;
        const risk = evalRisk(apexIntraday, MAX_RISK_RULEBOOK, {
            ...POLICY,
            instrument: InstrumentSymbol.NQ,
            stopPoints,
        });
        const state = apexIntraday.initialState();
        const sizing = resolvePositionSizing(InstrumentSymbol.NQ, stopPoints);
        if (sizing === null) throw new Error('expected NQ position sizing');
        const placed = capRiskToContractLimit(
            risk(state, 0),
            sizing,
            contractLimitAt(
                apexIntraday.contractLimits,
                TradingPhase.Eval,
                false,
                apexIntraday.tierProfitContext(state),
            ),
        );

        expect(placed).toBeCloseTo(1214.808, 9);
        trade(state, -placed);
        expect(risk(state, 1)).toBe(785.19);
    });
});

describe('documentedDayRisk: after the target (Q17 default)', () => {
    it('places the smallest placeable risk, $1 without an instrument, once a day', () => {
        const risk = evalRisk(apexIntraday);
        const state = pastTarget();

        expect(risk(state, 0)).toBe(1);
        trade(state, -1);
        expect(risk(state, 1)).toBe(0);
    });

    it('places one contract of the engine instrument at its stop', () => {
        const nq = evalRisk(apexIntraday, DEFAULT_RULEBOOK, {
            ...POLICY,
            instrument: InstrumentSymbol.NQ,
            stopPoints: 10,
        });
        const mnq = evalRisk(apexIntraday, MAX_RISK_RULEBOOK, {
            ...POLICY,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });

        expect(nq(pastTarget(), 0)).toBe(200);
        expect(mnq(pastTarget(), 0)).toBe(20);
    });

    it('also applies with a few cents left, where the rule itself would stop', () => {
        const state = stateAt(52_999.99, 50_999.99);

        expect(evalRisk(apexIntraday)(state, 0)).toBe(1);
    });

    it('is disclosed in plain text without em dashes', () => {
        for (const disclosure of Object.values(DocumentedPolicyDisclosure)) {
            const text = DOCUMENTED_POLICY_DISCLOSURE_TEXT[disclosure];
            expect(text.length).toBeGreaterThan(20);
            expect(text).not.toContain(EM_DASH);
        }
        expect(
            DOCUMENTED_POLICY_DISCLOSURE_TEXT[
                DocumentedPolicyDisclosure.PostTargetSmallestPlaceableRisk
            ],
        ).toMatch(/smallest placeable risk/);
    });
});

describe('documentedDayRisk: funded stage', () => {
    it('trades the rulebook funded risk on every rung', () => {
        const state = apexEod.initialState();
        apexEod.beginFundedPhase(state);
        const risk = documentedDayRisk(
            apexEod,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            POLICY,
        );

        expect(allLossDay(risk, state)).toEqual([250, 250, 250, 250]);
    });
});
