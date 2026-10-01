import { describe, expect, it } from 'vitest';

import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    type PlanValuesFigures,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type AccountValueColumns,
    accountValueColumnsOf,
    type AccountValueInput,
    AccountValueInputKind,
    type AccountValueModeledInput,
    type AccountValueOptions,
    AtRiskKind,
    DEFAULT_NEXT_PAYOUT_HIGHLIGHT_DAYS,
    EvPerAttemptKind,
    ExpectedPayoutsKind,
    expectedValueOf,
    FigureBasis,
    MIN_PAYING_SHARE_FOR_NEXT_PAYOUT_HIGHLIGHT,
    nextActionOf,
    NextActionSourceKind,
    NextPayoutKind,
} from '~/app/(app)/prop-calculator/accounts/_components/accountValueColumns';
import { ACCOUNT_ACTION_TEXT } from '~/app/(app)/prop-calculator/accounts/_components/advice/accountActionModel';
import {
    type EngineSlot,
    EngineSlotKind,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { formatCurrency } from '~/lib/format';
import { AdviceUnavailableReason } from '~/lib/prop-accounts';
import {
    dollars,
    FirmId,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    AccountSubstate,
    type Advice,
    AdviceStalenessReason,
    DEFAULT_RULEBOOK,
    type NextPayoutProjection,
    PayoutRequestDecisionKind,
    RetainedCushionBasis,
    RuleSource,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    SizingAssumption,
    SizingConstraint,
    SizingProvenance,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    adviceCoverageOf,
    AdviceCoverageOutcomeKind,
} from '~/lib/prop-calculator/advisor/actions';
import {
    MilestoneKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { findFirm } from '~/lib/prop-calculator/firms';

const TODAY = '2026-09-28';

function topStep(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan missing');
    return plan;
}

const PLAN = topStep();
const RETRY_FEE = PLAN.retryFee();

const OPTIONS: AccountValueOptions = {
    highlightWithinDays: 7,
    sampleThresholds: DEFAULT_RULEBOOK.samples,
};

function adviceOf(stage: SizingStage, substate: AccountSubstate): Advice {
    const outcome = adviceCoverageOf(PLAN, stage, substate, TODAY);
    if (outcome.kind !== AdviceCoverageOutcomeKind.Advice) {
        throw new Error(`no advice for ${stage} ${substate}`);
    }
    return outcome.advice;
}

function payoutEligibleAdvice(): Advice {
    return {
        ...adviceOf(SizingStage.Funded, AccountSubstate.Fresh),
        payoutAdvice: {
            assumptions: [],
            documented: {
                kind: PayoutRequestDecisionKind.Request,
                notice: null,
                requestAmount: dollars(500),
                retainedCushion: dollars(2000),
                retainedCushionBasis: RetainedCushionBasis.RulebookSize,
                sources: [RuleSource.PayoutSize],
            },
            engineHorizonCredit: null,
            netAfterSplit: dollars(450),
        },
    };
}

function ready<Figures>(figures: Figures): EngineSlot<Figures> {
    return { figures, kind: EngineSlotKind.Ready };
}

function valueOf(creditFree: number, creditInclusive = creditFree + 150) {
    return {
        creditFree: { standardError: 70, value: creditFree },
        creditInclusive: { standardError: 70, value: creditInclusive },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

const PENDING = { kind: EngineSlotKind.Pending } as const;

function atRiskOf(columns: AccountValueColumns) {
    if (columns.atRisk === null) throw new Error('no at-risk figure');
    return columns.atRisk;
}

function columnsOf(
    input: AccountValueInput,
    options: Partial<AccountValueOptions> = {},
): AccountValueColumns {
    return accountValueColumnsOf(input, { ...OPTIONS, ...options });
}

function documented(
    overrides: Partial<DocumentedRunFigures> = {},
): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0.01, value: 0.4 },
        attemptPassProbability: { standardError: 0.02, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 120 },
        costPerFundedAccount: 777,
        expectedMonthlyNet: { standardError: 11, value: 1234 },
        expectedMonthlyRealizedNet: { standardError: 9, value: 1111 },
        expectedNetPerAttempt: { standardError: 5, value: 55 },
        expectedPayoutPerFundedAccount: { standardError: 20, value: 900 },
        fundedBustProbability: { standardError: 0.02, value: 0.2 },
        fundedHorizonDays: 252,
        fundedPayoutCountDistribution: [0.6, 0.2, 0.1, 0.05, 0.03, 0.02],
        fundedSurvivalProbability: { standardError: 0.03, value: 0.55 },
        minRetainedCushion: 2750,
        payoutRequestSize: 1250,
        payoutsPerFundedAccount: { standardError: 0.1, value: 1.5 },
        trials: 2000,
        ...overrides,
    };
}

function evalAccount(
    valueNow: number,
    valueFreshEval: number,
    overrides: Partial<AccountValueModeledInput> = {},
): AccountValueModeledInput {
    return modeled({
        fromState: fromStateSlot(valueOf(valueNow), null, SizingStage.Eval),
        planValues: ready(planValues(valueFreshEval)),
        stage: SizingStage.Eval,
        ...overrides,
    });
}

function evOf(columns: AccountValueColumns) {
    if (columns.evPerAttempt === null) throw new Error('no EV per attempt');
    if (columns.evPerAttempt.kind !== EvPerAttemptKind.Ready) {
        throw new Error(`EV per attempt is ${columns.evPerAttempt.kind}`);
    }
    return columns.evPerAttempt;
}

function fromState(
    valueNow: ReturnType<typeof valueOf>,
    nextPayout: NextPayoutProjection | null = null,
    stage: SizingStage.Eval | SizingStage.Funded = SizingStage.Funded,
): AccountFromStateFigures {
    return {
        milestone: {
            debited: null,
            kind: MilestoneKind.Eval,
            received: null,
            unmetGates: [],
            value: {
                kind: ValueChainStepOutcomeKind.Value,
                value: valueOf(2500),
            },
        },
        nextPayout,
        stage,
        startBasis: StartBasis.FromState,
        trials: 2000,
        valueNow,
    };
}

function fromStateSlot(
    valueNow: ReturnType<typeof valueOf>,
    nextPayout: NextPayoutProjection | null = null,
    stage: SizingStage.Eval | SizingStage.Funded = SizingStage.Funded,
): EngineSlot<AccountFromStateFigures> {
    return ready(fromState(valueNow, nextPayout, stage));
}

function funded(
    days: number,
    payingTrials = 2000,
    standardError = 0.4,
): AccountValueModeledInput {
    return fundedAccount(1800, projection(days, payingTrials, standardError));
}

function fundedAccount(
    valueNow: number,
    nextPayout: NextPayoutProjection | null = null,
): AccountValueModeledInput {
    return modeled({ fromState: fromStateSlot(valueOf(valueNow), nextPayout) });
}

function modeled(
    overrides: Partial<AccountValueModeledInput> = {},
): AccountValueModeledInput {
    return {
        action: nextActionOf({
            advice: adviceOf(SizingStage.Funded, AccountSubstate.Fresh),
            kind: NextActionSourceKind.Advice,
        }),
        documented: ready(documented()),
        fromState: ready(fromState(valueOf(1800))),
        kind: AccountValueInputKind.Modeled,
        planValues: ready(planValues(1000)),
        realized: null,
        retryFee: RETRY_FEE,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function planValues(valueFreshEval: number): PlanValuesFigures {
    return {
        freshFundedValue: valueOf(2000),
        retryFee: RETRY_FEE,
        trials: 2000,
        valueFreshEval: valueOf(valueFreshEval),
    };
}

function projection(
    days: number,
    payingTrials = 2000,
    standardError = 0.4,
): NextPayoutProjection {
    return {
        accountLostBeforeFirstPayoutProbability: 0.1,
        accountLostBeforeFirstPayoutStandardError: 0.01,
        expectedCalendarDaysToFirstPayout: { standardError, value: days },
        expectedResetFeeBeforeFirstPayout: { standardError: 1, value: 0 },
        expectedSessionDaysToFirstPayout: {
            standardError: 0.3,
            value: (days * 5) / 7,
        },
        firstPayoutCausedBreachProbability: 0.02,
        firstPayoutCausedBreachStandardError: 0.01,
        payingTrials,
        trials: 2000,
    };
}

describe('nextActionOf (F-V18, PT-74 accountActionOf)', () => {
    it('says Trade at the documented rung for a fresh funded account', () => {
        const advice = adviceOf(SizingStage.Funded, AccountSubstate.Fresh);
        const view = nextActionOf({
            advice,
            kind: NextActionSourceKind.Advice,
        });
        expect(view.action).toBe(AccountAction.Trade);
        expect(view.text).toBe(ACCOUNT_ACTION_TEXT[AccountAction.Trade]);
        const risk = advice.documented?.rungs[0]?.risk;
        expect(risk).toBeGreaterThan(0);
        expect(view.reason).toContain(`$${String(risk)}`);
    });

    it('names the documented basis, the binding constraint and the assumptions behind the rung', () => {
        const fresh = adviceOf(SizingStage.Funded, AccountSubstate.Fresh);
        const { documented } = fresh;
        const rung = documented?.rungs[0];
        if (documented === null || rung === undefined) {
            throw new Error('no documented rung');
        }
        const advice: Advice = {
            ...fresh,
            documented: {
                ...documented,
                assumptions: [SizingAssumption.NoCommission],
                provenance: SizingProvenance.MaxRisk,
                rungs: [
                    { ...rung, cappedBy: [SizingConstraint.CushionCap] },
                    ...documented.rungs.slice(1),
                ],
            },
        };
        const { reason } = nextActionOf({
            advice,
            kind: NextActionSourceKind.Advice,
        });
        expect(reason).toContain(SizingProvenance.MaxRisk);
        expect(reason).toContain(
            SIZING_CONSTRAINT_TEXT[SizingConstraint.CushionCap],
        );
        expect(reason).toContain(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.NoCommission],
        );
    });

    it('says RequestPayout for a payout-eligible account and leaves the documented rung in view', () => {
        const advice = payoutEligibleAdvice();
        const view = nextActionOf({
            advice,
            kind: NextActionSourceKind.Advice,
        });
        expect(view.action).toBe(AccountAction.RequestPayout);
        expect(view.text).toBe(
            ACCOUNT_ACTION_TEXT[AccountAction.RequestPayout],
        );
        const risk = advice.documented?.rungs[0]?.risk;
        expect(view.reason).toContain(`$${String(risk)}`);
    });

    it('shows the requested amount, what the trader receives and the cushion the request leaves behind', () => {
        const { reason } = nextActionOf({
            advice: payoutEligibleAdvice(),
            kind: NextActionSourceKind.Advice,
        });
        expect(reason).toContain('Request $500');
        expect(reason).toContain('you receive $450 after the split');
        expect(reason).toContain('$2,000 stays in the account as cushion');
    });

    it('says EnterSnapshot when the advice is stale, naming the snapshot date, even when payout-eligible', () => {
        const advice: Advice = {
            ...payoutEligibleAdvice(),
            staleness: {
                kind: 'stale',
                noHolidayCalendarDisclosure: false,
                reasons: [AdviceStalenessReason.FundedSnapshotStale],
                snapshotAsOf: '2026-08-01',
            },
        };
        const view = nextActionOf({
            advice,
            kind: NextActionSourceKind.Advice,
        });
        expect(view.action).toBe(AccountAction.EnterSnapshot);
        expect(view.reason).toContain('2026-08-01');
    });

    it('says StopForToday when the day plan has no rung left', () => {
        const fresh = adviceOf(SizingStage.Funded, AccountSubstate.Fresh);
        if (fresh.dailyPlanCard === null) throw new Error('no card');
        const advice: Advice = {
            ...fresh,
            dailyPlanCard: { ...fresh.dailyPlanCard, rungs: [] },
        };
        const view = nextActionOf({
            advice,
            kind: NextActionSourceKind.Advice,
        });
        expect(view.action).toBe(AccountAction.StopForToday);
        expect(view.reason).toContain('no risk room');
    });

    it('says NotModeled when the engine documents no sizing', () => {
        const fresh = adviceOf(SizingStage.Funded, AccountSubstate.Fresh);
        const view = nextActionOf({
            advice: { ...fresh, dailyPlanCard: null, documented: null },
            kind: NextActionSourceKind.Advice,
        });
        expect(view.action).toBe(AccountAction.NotModeled);
        expect(view.reason).not.toBeNull();
    });

    it('says NotModeled with the ledger reason for a ledger-only account', () => {
        const view = nextActionOf({
            kind: NextActionSourceKind.LedgerOnly,
            reason: AdviceUnavailableReason.LedgerOnly,
        });
        expect(view.action).toBe(AccountAction.NotModeled);
        expect(view.reason?.toLowerCase()).toContain('ledger');
    });

    it('passes a typed unavailable state through with its reason', () => {
        expect(
            nextActionOf({
                kind: NextActionSourceKind.EnterSnapshot,
                reason: 'it has no snapshot yet',
            }),
        ).toStrictEqual({
            action: AccountAction.EnterSnapshot,
            reason: 'it has no snapshot yet',
            text: ACCOUNT_ACTION_TEXT[AccountAction.EnterSnapshot],
        });
        const notModeled = nextActionOf({
            kind: NextActionSourceKind.NotModeled,
            reason: 'this firm is no longer modeled',
        });
        expect(notModeled.action).toBe(AccountAction.NotModeled);
        expect(notModeled.reason).toBe('this firm is no longer modeled');
    });

    it('never says Retire for any stage or substate (QV-19 default)', () => {
        const actions = [SizingStage.Eval, SizingStage.Funded].flatMap(
            (stage) =>
                [
                    AccountSubstate.Fresh,
                    AccountSubstate.InProfit,
                    AccountSubstate.NearFloor,
                    AccountSubstate.PayoutReady,
                    AccountSubstate.PostPayout,
                ].map(
                    (substate) =>
                        nextActionOf({
                            advice: adviceOf(stage, substate),
                            kind: NextActionSourceKind.Advice,
                        }).action,
                ),
        );
        expect(actions).not.toContain(AccountAction.Retire);
    });
});

describe('accountValueColumnsOf: expected payouts (Q1, V-70)', () => {
    it('is the credit-free from-state value with its standard error, never the credit-inclusive one', () => {
        const slot = fromStateSlot(valueOf(1800, 9999));
        const columns = columnsOf(modeled({ fromState: slot }));
        expect(columns.expectedPayouts).toStrictEqual({
            creditFree: 1800,
            kind: ExpectedPayoutsKind.Ready,
            text: '$1,800 (SE $70)',
        });
        expect(expectedValueOf(columns)).toBe(1800);
    });

    it('gives two accounts at different stages different expected payouts', () => {
        const eval_ = columnsOf(evalAccount(1200, 1000));
        const funded = columnsOf(fundedAccount(2500));
        expect(expectedValueOf(eval_)).not.toBe(expectedValueOf(funded));
    });

    it('is pending while the worker has not answered, with no sort value', () => {
        const columns = columnsOf(modeled({ fromState: PENDING }));
        expect(columns.expectedPayouts.kind).toBe(ExpectedPayoutsKind.Pending);
        expect(expectedValueOf(columns)).toBeNull();
    });

    it.each([EngineSlotKind.Failed, EngineSlotKind.Refused] as const)(
        'is not valued, with the engine reason, when the slot is %s',
        (kind) => {
            const columns = columnsOf(
                modeled({ fromState: { kind, reason: 'engine said no' } }),
            );
            expect(columns.expectedPayouts).toStrictEqual({
                kind: ExpectedPayoutsKind.NotValued,
                reason: 'engine said no',
            });
            expect(expectedValueOf(columns)).toBeNull();
        },
    );

    it('is not valued for a ledger-only account, with the ledger reason and a NotModeled action', () => {
        const columns = columnsOf({
            kind: AccountValueInputKind.LedgerOnly,
            reason: AdviceUnavailableReason.LedgerOnly,
        });
        expect(columns.expectedPayouts.kind).toBe(
            ExpectedPayoutsKind.NotValued,
        );
        if (columns.expectedPayouts.kind !== ExpectedPayoutsKind.NotValued) {
            return;
        }
        expect(columns.expectedPayouts.reason.toLowerCase()).toContain(
            'ledger',
        );
        expect(columns.action.action).toBe(AccountAction.NotModeled);
        expect(columns.atRisk).toBeNull();
        expect(columns.evPerAttempt).toBeNull();
        expect(columns.nextPayout.kind).toBe(NextPayoutKind.NotValued);
    });

    it('is not valued for an account the engine cannot value, keeping its next action', () => {
        const columns = columnsOf({
            action: nextActionOf({
                kind: NextActionSourceKind.EnterSnapshot,
                reason: 'it has no snapshot yet',
            }),
            kind: AccountValueInputKind.NotValued,
            reason: 'it has no snapshot yet',
        });
        expect(columns.expectedPayouts).toStrictEqual({
            kind: ExpectedPayoutsKind.NotValued,
            reason: 'it has no snapshot yet',
        });
        expect(columns.action.action).toBe(AccountAction.EnterSnapshot);
    });
});

describe('accountValueColumnsOf: next payout and its highlight', () => {
    it('gives the expected calendar days to the first payout with its standard error', () => {
        const columns = columnsOf(funded(3.4));
        expect(columns.nextPayout).toMatchObject({
            days: 3.4,
            isSoon: true,
            kind: NextPayoutKind.InDays,
            payingShare: 1,
            text: '3.4 calendar days (SE 0.4)',
        });
    });

    it('discloses how many trials reached a payout and how often the account was lost first', () => {
        const { note, payingShare } = columnsOf(funded(3.4, 1200)).nextPayout;
        expect(payingShare).toBe(0.6);
        expect(note).toContain('1,200 of 2,000 trials reached a payout');
        expect(note).toContain(
            'Account lost before the first payout: 10.0% (SE 1.0%)',
        );
        expect(note).toContain(
            'Days are averaged over the trials that reached a payout',
        );
    });

    it('withholds the highlight when fewer than the minimum share of trials reach a payout', () => {
        expect(MIN_PAYING_SHARE_FOR_NEXT_PAYOUT_HIGHLIGHT).toBe(0.5);
        expect(columnsOf(funded(3.4, 1000)).nextPayout.isSoon).toBe(true);
        const unlikely = columnsOf(funded(3.4, 999)).nextPayout;
        expect(unlikely.isSoon).toBe(false);
        expect(unlikely.kind).toBe(NextPayoutKind.InDays);
        expect(unlikely.text).toBe('3.4 calendar days (SE 0.4)');
    });

    it('prints a missing standard error as not applicable', () => {
        const account = fundedAccount(1800, {
            ...projection(3.4),
            expectedCalendarDaysToFirstPayout: {
                standardError: null,
                value: 3.4,
            },
        });
        expect(columnsOf(account).nextPayout.text).toBe(
            '3.4 calendar days (SE n/a)',
        );
    });

    it('highlights a payout within the configured number of days, boundary included, and not beyond', () => {
        expect(
            columnsOf(funded(7), { highlightWithinDays: 7 }).nextPayout,
        ).toMatchObject({ isSoon: true });
        expect(
            columnsOf(funded(7.1), { highlightWithinDays: 7 }).nextPayout,
        ).toMatchObject({ isSoon: false });
        expect(
            columnsOf(funded(7.1), { highlightWithinDays: 10 }).nextPayout,
        ).toMatchObject({ isSoon: true });
        expect(
            columnsOf(funded(3.4), { highlightWithinDays: 3 }).nextPayout,
        ).toMatchObject({ isSoon: false });
    });

    it('has a default highlight window of seven calendar days', () => {
        expect(DEFAULT_NEXT_PAYOUT_HIGHLIGHT_DAYS).toBe(7);
    });

    it('says now, highlighted, when every trial is already eligible', () => {
        const { nextPayout } = columnsOf(funded(0, 2000, 0));
        expect(nextPayout).toMatchObject({
            days: 0,
            isSoon: true,
            kind: NextPayoutKind.Now,
            text: 'Eligible now',
        });
        expect(nextPayout.note).toContain("the engine's payout check");
    });

    it('keeps an eligible account highlighted even though every trial pays on day zero', () => {
        expect(columnsOf(funded(0, 2000, 0)).nextPayout.payingShare).toBe(1);
    });

    it('says no payout, never highlighted, when no trial reached one', () => {
        expect(columnsOf(funded(0, 0)).nextPayout).toStrictEqual({
            days: null,
            isSoon: false,
            kind: NextPayoutKind.NoPayout,
            note: null,
            payingShare: 0,
            text: 'No simulated payout within the horizon',
        });
    });

    it('is not applicable before the account is funded', () => {
        expect(columnsOf(evalAccount(1200, 1000)).nextPayout).toMatchObject({
            days: null,
            isSoon: false,
            kind: NextPayoutKind.NotFunded,
        });
    });

    it('is pending while the worker has not answered', () => {
        expect(columnsOf(modeled({ fromState: PENDING })).nextPayout.kind).toBe(
            NextPayoutKind.Pending,
        );
    });
});

describe('accountValueColumnsOf: at risk if busted (F-V16, VD-10)', () => {
    it('equals the retry fee at a fresh eval, where V(now) equals V(fresh eval)', () => {
        const atRisk = atRiskOf(columnsOf(evalAccount(1000, 1000)));
        expect(atRisk.kind).toBe(AtRiskKind.Exact);
        expect(atRisk.text).toBe(
            `At risk if busted: $${RETRY_FEE.toLocaleString('en-US')}`,
        );
    });

    it('is more than the retry fee when the account is worth more than a fresh eval', () => {
        const atRisk = atRiskOf(columnsOf(evalAccount(1400, 1000)));
        expect(atRisk.kind).toBe(AtRiskKind.Exact);
        expect(atRisk.text).toBe(
            `At risk if busted: $${(400 + RETRY_FEE).toLocaleString('en-US')}`,
        );
    });

    it('uses the credit-free values, not the credit-inclusive ones', () => {
        const slot = fromStateSlot(valueOf(1400, 8888), null, SizingStage.Eval);
        const columns = columnsOf(evalAccount(1400, 1000, { fromState: slot }));
        expect(atRiskOf(columns).text).toContain(
            (400 + RETRY_FEE).toLocaleString('en-US'),
        );
    });

    it('discloses that the rebuy lag is not priced', () => {
        const columns = columnsOf(evalAccount(1400, 1000));
        expect(atRiskOf(columns).note).toContain('rebought eval');
    });

    it('never goes negative: a fresh eval worth more than the account says so', () => {
        const atRisk = atRiskOf(columnsOf(evalAccount(500, 1000)));
        expect(atRisk.text).not.toContain('-$');
        expect(atRisk.text).toContain('$0');
        expect(atRisk.note).toContain(
            'fresh eval is worth more than this account net of the retry fee',
        );
        expect(atRisk.note).toContain(
            `the unclamped figure is ${formatCurrency(RETRY_FEE - 500)}`,
        );
    });

    it.each([
        ['pending value', { fromState: PENDING }],
        ['pending plan values', { planValues: PENDING }],
    ])(
        'falls back to at least the retry fee only while the figures are pending (%s)',
        (_label, overrides) => {
            const atRisk = atRiskOf(
                columnsOf(evalAccount(1400, 1000, overrides)),
            );
            expect(atRisk.kind).toBe(AtRiskKind.AtLeast);
            expect(atRisk.text).toBe(
                `At risk if busted: at least $${RETRY_FEE.toLocaleString('en-US')} (the retry fee; exact only at a fresh eval)`,
            );
        },
    );

    it.each([
        [
            'failed plan values',
            {
                planValues: {
                    kind: EngineSlotKind.Failed,
                    reason: 'plan values worker failed',
                } as const,
            },
            'plan values worker failed',
        ],
        [
            'refused value',
            {
                fromState: {
                    kind: EngineSlotKind.Refused,
                    reason: 'value refused',
                } as const,
            },
            'value refused',
        ],
        [
            'failed value with the plan values still pending',
            {
                fromState: {
                    kind: EngineSlotKind.Failed,
                    reason: 'value worker failed',
                } as const,
                planValues: PENDING,
            },
            'value worker failed',
        ],
    ])(
        'is unavailable with the engine reason, never the retry fee, when a figure failed (%s)',
        (_label, overrides, reason) => {
            const atRisk = atRiskOf(
                columnsOf(evalAccount(1400, 1000, overrides)),
            );
            expect(atRisk.kind).toBe(AtRiskKind.Unavailable);
            expect(atRisk.text).toBe(
                `At risk if busted is not available: ${reason}`,
            );
            expect(atRisk.text).not.toContain('at least');
        },
    );

    it('is shown for eval accounts only', () => {
        expect(columnsOf(modeled()).atRisk).toBeNull();
    });
});

describe('accountValueColumnsOf: EV per attempt (F-V16, VD-28)', () => {
    it('is the engine credit-free net per attempt, labelled modeled, when nothing is realized', () => {
        const ev = evOf(columnsOf(evalAccount(1000, 1000)));
        expect(ev.text).toBe('EV per attempt: $55 (SE $5)');
        expect(ev.passBasis).toBe(FigureBasis.Modeled);
        expect(ev.fundedValueBasis).toBe(FigureBasis.Modeled);
        expect(ev.note).toContain('ignores time');
        expect(ev.note).toContain('not the ranking objective');
    });

    it('uses the realized pass rate only when a threshold is set and met', () => {
        const realized = {
            fundedValue: null,
            passRate: { n: 40, value: 0.5 },
        };
        const withThreshold = evOf(
            columnsOf(evalAccount(1000, 1000, { realized }), {
                sampleThresholds: {
                    ...DEFAULT_RULEBOOK.samples,
                    minEvalAttempts: 30,
                },
            }),
        );
        expect(withThreshold.passBasis).toBe(FigureBasis.Realized);
        expect(withThreshold.fundedValueBasis).toBe(FigureBasis.Modeled);
        expect(withThreshold.text).toBe('EV per attempt: $330');
        expect(withThreshold.note).toContain('n = 40');

        const noThreshold = evOf(
            columnsOf(evalAccount(1000, 1000, { realized })),
        );
        expect(noThreshold.passBasis).toBe(FigureBasis.Modeled);
        expect(noThreshold.text).toBe('EV per attempt: $55 (SE $5)');

        const notMet = evOf(
            columnsOf(evalAccount(1000, 1000, { realized }), {
                sampleThresholds: {
                    ...DEFAULT_RULEBOOK.samples,
                    minEvalAttempts: 50,
                },
            }),
        );
        expect(notMet.passBasis).toBe(FigureBasis.Modeled);
    });

    it('uses the realized funded value only when its threshold is set and met', () => {
        const realized = {
            fundedValue: { n: 20, value: 2000 },
            passRate: null,
        };
        const met = evOf(
            columnsOf(evalAccount(1000, 1000, { realized }), {
                sampleThresholds: {
                    ...DEFAULT_RULEBOOK.samples,
                    minFundedAccounts: 10,
                },
            }),
        );
        expect(met.fundedValueBasis).toBe(FigureBasis.Realized);
        expect(met.passBasis).toBe(FigureBasis.Modeled);
        expect(met.text).toBe('EV per attempt: $480');

        const unmet = evOf(
            columnsOf(evalAccount(1000, 1000, { realized }), {
                sampleThresholds: {
                    ...DEFAULT_RULEBOOK.samples,
                    minFundedAccounts: 25,
                },
            }),
        );
        expect(unmet.fundedValueBasis).toBe(FigureBasis.Modeled);
    });

    it('mixes both realized figures into the one definition, attempt cost from the engine', () => {
        const ev = evOf(
            columnsOf(
                evalAccount(1000, 1000, {
                    realized: {
                        fundedValue: { n: 20, value: 2000 },
                        passRate: { n: 40, value: 0.5 },
                    },
                }),
                {
                    sampleThresholds: {
                        ...DEFAULT_RULEBOOK.samples,
                        minEvalAttempts: 30,
                        minFundedAccounts: 10,
                    },
                },
            ),
        );
        expect(ev.text).toBe('EV per attempt: $880');
    });

    it('shows a negative EV with its sign', () => {
        const figures = documented({
            expectedNetPerAttempt: { standardError: 5, value: -80 },
        });
        const account = evalAccount(1000, 1000, {
            documented: ready(figures),
        });
        expect(evOf(columnsOf(account)).text).toBe(
            'EV per attempt: -$80 (SE $5)',
        );
    });

    it('is pending, then unavailable with the reason, while the documented run is missing', () => {
        expect(
            columnsOf(evalAccount(1000, 1000, { documented: PENDING }))
                .evPerAttempt,
        ).toStrictEqual({ kind: EvPerAttemptKind.Pending });
        expect(
            columnsOf(
                evalAccount(1000, 1000, {
                    documented: {
                        kind: EngineSlotKind.Refused,
                        reason: 'no sizing',
                    },
                }),
            ).evPerAttempt,
        ).toStrictEqual({
            kind: EvPerAttemptKind.Unavailable,
            reason: 'no sizing',
        });
    });

    it('is shown for eval accounts only', () => {
        expect(columnsOf(modeled()).evPerAttempt).toBeNull();
    });
});
