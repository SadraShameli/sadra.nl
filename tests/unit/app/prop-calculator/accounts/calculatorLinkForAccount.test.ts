import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { decodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    AccountCalculatorLinkFlag,
    calculatorLinkForAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/calculatorLinkForAccount';
import {
    ALL_FIRMS,
    DayStopRuleKind,
    effectivePayoutRequest,
    FirmId,
    InstrumentSymbol,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanOptIns,
    points,
    PolicySizing,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedSizingOf,
    type EnginePolicyPositionSizing,
    EvalSizingMode,
    fundedStopRuleToDayStopRule,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { evalStartAccount } from '~/lib/prop-calculator/advisor/value';
import { routes } from '~/lib/site/routes';

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isWanted: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isWanted);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no modeled plan matches');
}

const MFF_PRO = findFirmPlan(
    (plan) => plan.id.firm === FirmId.Mffu && plan.label.includes('Pro'),
);
const TOPSTEP = findFirmPlan((plan) => plan.id.firm === FirmId.TopStep);
const WITH_FUNDED_RESET = findFirmPlan((plan) => plan.fundedReset !== null);
const WITH_EARLY_WITHDRAWAL = findFirmPlan(
    (plan) => plan.oneTimeEarlyWithdrawal !== null,
);

const RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    funded: {
        ...DEFAULT_RULEBOOK.funded,
        riskCents: 30_000,
        stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        takeProfitCents: 60_000,
        tradesPerDayMax: 3,
    },
    strategy: { rr: 1.5, tradesPerDayMax: 3, winrate: 0.45 },
};

function decoded(href: string) {
    const [path, query] = href.split('?', 2);
    return {
        path,
        state: decodeState(
            new URLSearchParams(query),
            ALL_FIRMS,
            defaultCalculatorState(),
        ),
    };
}

function linkOf(
    { plan }: FirmPlan,
    overrides: {
        readonly optIns?: PlanOptIns;
        readonly positionSizing?: EnginePolicyPositionSizing | null;
        readonly rulebook?: RulebookParameters;
        readonly stage?: SizingStage;
    } = {},
) {
    const link = calculatorLinkForAccount({
        firmId: plan.id.firm,
        optIns: overrides.optIns ?? NO_PLAN_OPT_INS,
        planSerial: serializePlanId(plan.id),
        positionSizing: overrides.positionSizing ?? null,
        rulebook: overrides.rulebook ?? RULEBOOK,
        stage: overrides.stage ?? SizingStage.Funded,
    });
    if (link === null) throw new Error('expected a calculator link');
    return link;
}

describe('calculatorLinkForAccount', () => {
    it('points at the simulator and round-trips the firm, plan and rulebook strategy', () => {
        const link = linkOf(MFF_PRO);
        const { path, state } = decoded(link.href);
        expect(path).toBe(routes.propCalculator.simulator);
        expect(state.firm.id).toBe(MFF_PRO.firm.id);
        expect(serializePlanId(state.plan.id)).toBe(
            serializePlanId(MFF_PRO.plan.id),
        );
        expect(state.winrate).toBeCloseTo(0.45, 3);
        expect(state.rrRatio).toBeCloseTo(1.5, 2);
        expect(state.tradesPerDay).toBe(3);
    });

    it('is the same link every time it is built (no random lab or portfolio ids)', () => {
        expect(linkOf(MFF_PRO).href).toBe(linkOf(MFF_PRO).href);
        const query = new URLSearchParams(
            linkOf(MFF_PRO).href.split('?', 2)[1],
        );
        expect(query.has('lab')).toBe(false);
        expect(query.has('pf')).toBe(false);
    });

    it('carries the funded risk, the funded stop rule, the rulebook retained cushion and the effective payout request for a funded account', () => {
        const { state } = decoded(linkOf(MFF_PRO).href);
        expect(state.riskDollars).toBe(300);
        expect(state.dayStop).toEqual(
            fundedStopRuleToDayStopRule(RULEBOOK.funded.stopRule),
        );
        expect(state.retainedCushion).toBe(
            RULEBOOK.payout.retainedCushionCents / 100,
        );
        expect(state.payoutRequestSize).toBe(
            effectivePayoutRequest(
                MFF_PRO.plan,
                RULEBOOK.payout.requestCents / 100,
            ),
        );
        expect(state.payoutRequestSize).toBeGreaterThan(
            RULEBOOK.payout.requestCents / 100,
        );
        expect(state.evalDayPolicy).toBeNull();
    });

    it('always sets the retained cushion from the rulebook, never null (TopStep 2000)', () => {
        const { state } = decoded(
            linkOf(TOPSTEP, { rulebook: DEFAULT_RULEBOOK }).href,
        );
        expect(state.retainedCushion).toBe(2000);
    });

    it('round-trips the plan opt-ins', () => {
        const reset = decoded(
            linkOf(WITH_FUNDED_RESET, {
                optIns: {
                    takesFundedReset: true,
                    takesOneTimeEarlyWithdrawal: false,
                },
            }).href,
        );
        expect(reset.state.takesFundedReset).toBe(true);
        expect(reset.state.takesOneTimeEarlyWithdrawal).toBe(false);
        const early = decoded(
            linkOf(WITH_EARLY_WITHDRAWAL, {
                optIns: {
                    takesFundedReset: false,
                    takesOneTimeEarlyWithdrawal: true,
                },
            }).href,
        );
        expect(early.state.takesOneTimeEarlyWithdrawal).toBe(true);
    });

    it('gives an eval account the documented eval ladder at the fresh-start cushion as a static contract-capped ladder', () => {
        const link = linkOf(TOPSTEP, { stage: SizingStage.Eval });
        const { state } = decoded(link.href);
        const expected = documentedSizingOf(
            evalStartAccount(TOPSTEP.plan),
            RULEBOOK,
        ).sizing.rungs.map((rung) => rung.risk);
        expect(expected.length).toBeGreaterThan(0);
        expect(state.evalDayPolicy).not.toBeNull();
        expect(state.evalDayPolicy?.ladder).toEqual(expected);
        expect(state.evalDayPolicy?.sizing).toBe(PolicySizing.ContractCapped);
        expect(state.evalDayPolicy?.maxLossesPerDay).toBeNull();
        expect(link.flags).not.toContain(
            AccountCalculatorLinkFlag.EvalSizingApproximatedByLadder,
        );
    });

    it('flags a max-risk eval account as not representable, approximated by the ladder', () => {
        const maxRisk: RulebookParameters = {
            ...RULEBOOK,
            eval: { ...RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
        };
        const link = linkOf(TOPSTEP, {
            rulebook: maxRisk,
            stage: SizingStage.Eval,
        });
        expect(link.flags).toContain(
            AccountCalculatorLinkFlag.EvalSizingApproximatedByLadder,
        );
    });

    it('never flags a funded account for the eval sizing mode', () => {
        const maxRisk: RulebookParameters = {
            ...RULEBOOK,
            eval: { ...RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
        };
        expect(linkOf(TOPSTEP, { rulebook: maxRisk }).flags).not.toContain(
            AccountCalculatorLinkFlag.EvalSizingApproximatedByLadder,
        );
    });

    it('sends the instrument and stop together only, and flags the unsized funded risk otherwise', () => {
        const unsized = linkOf(TOPSTEP);
        expect(unsized.flags).toContain(
            AccountCalculatorLinkFlag.FundedRiskUnsized,
        );
        const unsizedQuery = new URLSearchParams(unsized.href.split('?', 2)[1]);
        expect(unsizedQuery.has('instr')).toBe(false);
        expect(unsizedQuery.has('sp')).toBe(false);

        const sized = linkOf(TOPSTEP, {
            positionSizing: {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: points(20),
            },
        });
        expect(sized.flags).not.toContain(
            AccountCalculatorLinkFlag.FundedRiskUnsized,
        );
        const { state } = decoded(sized.href);
        expect(state.instrument).toBe(InstrumentSymbol.MNQ);
        expect(state.stopPoints).toBe(20);
    });

    it('says in its label that it is a fresh start', () => {
        expect(linkOf(MFF_PRO).label.toLowerCase()).toContain('fresh start');
    });

    it('returns null for a live account, an unknown plan or an unknown firm', () => {
        expect(
            calculatorLinkForAccount({
                firmId: MFF_PRO.plan.id.firm,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(MFF_PRO.plan.id),
                rulebook: RULEBOOK,
                stage: SizingStage.Live,
            }),
        ).toBeNull();
        expect(
            calculatorLinkForAccount({
                firmId: MFF_PRO.plan.id.firm,
                optIns: NO_PLAN_OPT_INS,
                planSerial: 'no-such-plan',
                rulebook: RULEBOOK,
                stage: SizingStage.Funded,
            }),
        ).toBeNull();
    });

    it('does not use any em dash in its label', () => {
        expect(linkOf(MFF_PRO).label).not.toContain('—');
    });
});
