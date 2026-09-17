import {
    ApexVariant,
    CorrelationMode,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    findFirm,
    FirmId,
    type InstrumentSymbol,
    type Plan,
    type RungSizing,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

import { clampInt, clampNumber, clampStateToPlan } from './clamp';
import {
    type CalculatorState,
    type LabScenario,
    type PortfolioEntry,
    SizingMode,
} from './types';

function required<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

const DEFAULT_FIRM: TradingFirm = required(
    findFirm(FirmId.Apex),
    'Prop calculator: Apex firm missing from registry',
);
const DEFAULT_PLAN: Plan = required(
    DEFAULT_FIRM.plans.find((p) => p.accountSize === 50_000),
    'Prop calculator: default $50K plan missing from Apex',
);

export enum CalculatorActionType {
    AddLabScenario = 'add-lab-scenario',
    ApplyState = 'apply-state',
    RemoveLabScenario = 'remove-lab-scenario',
    Reset = 'reset',
    ResetCoupon = 'reset-coupon',
    ResetLabScenarios = 'reset-lab-scenarios',
    SetActivationDiscountPercent = 'set-activation-discount-percent',
    SetCommissionPerRoundTrip = 'set-commission-per-round-trip',
    SetCopyAccounts = 'set-copy-accounts',
    SetDayStop = 'set-day-stop',
    SetEvalDayPolicy = 'set-eval-day-policy',
    SetEvalDiscountPercent = 'set-eval-discount-percent',
    SetFirm = 'set-firm',
    SetFundedHorizonDays = 'set-funded-horizon-days',
    SetIdleDayProbability = 'set-idle-day-probability',
    SetInstrument = 'set-instrument',
    SetLabScenarios = 'set-lab-scenarios',
    SetLinkActivationDiscount = 'set-link-activation-discount',
    SetMaxAttempts = 'set-max-attempts',
    SetMaxEvalDays = 'set-max-eval-days',
    SetMonthlySubscriptionDiscountPercent = 'set-monthly-subscription-discount-percent',
    SetPayoutRequestSize = 'set-payout-request-size',
    SetPlan = 'set-plan',
    SetPortfolio = 'set-portfolio',
    SetResetDiscountPercent = 'set-reset-discount-percent',
    SetRetainedCushion = 'set-retained-cushion',
    SetRiskDollars = 'set-risk-dollars',
    SetRiskPercent = 'set-risk-percent',
    SetRrRatio = 'set-rr-ratio',
    SetRungSizing = 'set-rung-sizing',
    SetSeed = 'set-seed',
    SetSizingMode = 'set-sizing-mode',
    SetStopPoints = 'set-stop-points',
    SetTradesPerDay = 'set-trades-per-day',
    SetTrials = 'set-trials',
    SetWinrate = 'set-winrate',
    UpdateLabScenario = 'update-lab-scenario',
}

export type CalculatorAction =
    | {
          entries: LabScenario[];
          type: CalculatorActionType.SetLabScenarios;
      }
    | {
          entries: PortfolioEntry[];
          type: CalculatorActionType.SetPortfolio;
      }
    | { firm: TradingFirm; type: CalculatorActionType.SetFirm }
    | {
          id: string;
          patch: Partial<LabScenario>;
          type: CalculatorActionType.UpdateLabScenario;
      }
    | { id: string; type: CalculatorActionType.RemoveLabScenario }
    | {
          instrument: InstrumentSymbol | null;
          type: CalculatorActionType.SetInstrument;
      }
    | {
          isLinked: boolean;
          type: CalculatorActionType.SetLinkActivationDiscount;
      }
    | { mode: SizingMode; type: CalculatorActionType.SetSizingMode }
    | { plan: Plan; type: CalculatorActionType.SetPlan }
    | {
          policy: DayPolicy | null;
          type: CalculatorActionType.SetEvalDayPolicy;
      }
    | { rule: DayStopRule; type: CalculatorActionType.SetDayStop }
    | {
          state: CalculatorState;
          type: CalculatorActionType.ApplyState;
      }
    | { type: CalculatorActionType.AddLabScenario }
    | { type: CalculatorActionType.ResetCoupon }
    | { type: CalculatorActionType.ResetLabScenarios }
    | { type: CalculatorActionType.Reset }
    | {
          type: CalculatorActionType.SetActivationDiscountPercent;
          value: number;
      }
    | { type: CalculatorActionType.SetCommissionPerRoundTrip; value: number }
    | { type: CalculatorActionType.SetCopyAccounts; value: number }
    | { type: CalculatorActionType.SetEvalDiscountPercent; value: number }
    | { type: CalculatorActionType.SetFundedHorizonDays; value: number }
    | { type: CalculatorActionType.SetIdleDayProbability; value: number }
    | { type: CalculatorActionType.SetMaxAttempts; value: number }
    | { type: CalculatorActionType.SetMaxEvalDays; value: number }
    | {
          type: CalculatorActionType.SetMonthlySubscriptionDiscountPercent;
          value: number;
      }
    | {
          type: CalculatorActionType.SetPayoutRequestSize;
          value: null | number;
      }
    | { type: CalculatorActionType.SetResetDiscountPercent; value: number }
    | {
          type: CalculatorActionType.SetRetainedCushion;
          value: null | number;
      }
    | { type: CalculatorActionType.SetRiskDollars; value: number }
    | { type: CalculatorActionType.SetRiskPercent; value: number }
    | { type: CalculatorActionType.SetRrRatio; value: number }
    | { type: CalculatorActionType.SetRungSizing; value: RungSizing }
    | { type: CalculatorActionType.SetSeed; value: number }
    | { type: CalculatorActionType.SetStopPoints; value: number }
    | { type: CalculatorActionType.SetTradesPerDay; value: number }
    | { type: CalculatorActionType.SetTrials; value: number }
    | { type: CalculatorActionType.SetWinrate; value: number };

export function buildDefaultLabScenarios(): LabScenario[] {
    return [
        {
            accounts: 10,
            correlation: CorrelationMode.Copy,
            dayStop: { kind: DayStopRuleKind.None },
            groups: 1,
            id: freshId(),
            instrument: null,
            label: 'Risk-scale',
            riskPerTrade: 500,
            rrRatio: 2,
            stopPoints: null,
            tradesPerDay: 1,
            winrate: 0.4,
        },
        {
            accounts: 10,
            correlation: CorrelationMode.Copy,
            dayStop: { kind: DayStopRuleKind.None },
            groups: 1,
            id: freshId(),
            instrument: null,
            label: 'Frequency-scale',
            riskPerTrade: 250,
            rrRatio: 2,
            stopPoints: null,
            tradesPerDay: 4,
            winrate: 0.35,
        },
        {
            accounts: 10,
            correlation: CorrelationMode.Grouped,
            dayStop: { kind: DayStopRuleKind.None },
            groups: 2,
            id: freshId(),
            instrument: null,
            label: 'Group-split',
            riskPerTrade: 250,
            rrRatio: 2,
            stopPoints: null,
            tradesPerDay: 1,
            winrate: 0.4,
        },
    ];
}

export function calculatorReducer(
    state: CalculatorState,
    action: CalculatorAction,
): CalculatorState {
    switch (action.type) {
        case CalculatorActionType.AddLabScenario: {
            const last = state.labScenarios.at(-1);
            const base: LabScenario = last
                ? { ...last, id: freshId(), label: `${last.label} copy` }
                : defaultLabScenario();
            return { ...state, labScenarios: [...state.labScenarios, base] };
        }
        case CalculatorActionType.ApplyState: {
            return clampStateToPlan(action.state);
        }
        case CalculatorActionType.RemoveLabScenario: {
            return {
                ...state,
                labScenarios: state.labScenarios.filter(
                    (sc) => sc.id !== action.id,
                ),
            };
        }
        case CalculatorActionType.Reset: {
            return defaultCalculatorState();
        }
        case CalculatorActionType.ResetCoupon: {
            return {
                ...state,
                activationDiscountPercent: 0,
                evalDiscountPercent: 0,
                linkActivationDiscount: false,
                monthlySubscriptionDiscountPercent: 0,
                resetDiscountPercent: 0,
            };
        }
        case CalculatorActionType.ResetLabScenarios: {
            return { ...state, labScenarios: buildDefaultLabScenarios() };
        }
        case CalculatorActionType.SetActivationDiscountPercent: {
            return {
                ...state,
                activationDiscountPercent: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.act.min,
                    CALCULATOR_SCALAR_BOUNDS.act.max,
                    state.activationDiscountPercent,
                ),
            };
        }
        case CalculatorActionType.SetCommissionPerRoundTrip: {
            return {
                ...state,
                commissionPerRoundTrip: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.comm.min,
                    CALCULATOR_SCALAR_BOUNDS.comm.max,
                    state.commissionPerRoundTrip,
                ),
            };
        }
        case CalculatorActionType.SetCopyAccounts: {
            const cap = state.firm.maxFundedAccounts(state.plan);
            const clamped = clampInt(action.value, 1, cap, state.copyAccounts);
            return {
                ...state,
                copyAccounts: clamped,
                firmMemory: {
                    ...state.firmMemory,
                    [state.firm.id]: {
                        copyAccounts: clamped,
                        planId: state.plan.id,
                    },
                },
            };
        }
        case CalculatorActionType.SetDayStop: {
            return { ...state, dayStop: action.rule };
        }
        case CalculatorActionType.SetEvalDayPolicy: {
            return { ...state, evalDayPolicy: action.policy };
        }
        case CalculatorActionType.SetEvalDiscountPercent: {
            return {
                ...state,
                evalDiscountPercent: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.eval.min,
                    CALCULATOR_SCALAR_BOUNDS.eval.max,
                    state.evalDiscountPercent,
                ),
            };
        }
        case CalculatorActionType.SetFirm: {
            const { firm } = action;
            const firstPlan = firm.plans[0];
            if (!firstPlan) return state;
            const memoryWithCurrent = {
                ...state.firmMemory,
                [state.firm.id]: {
                    copyAccounts: state.copyAccounts,
                    planId: state.plan.id,
                },
            };
            const remembered = memoryWithCurrent[firm.id];
            const plan = remembered
                ? (firm.findPlan(remembered.planId) ?? firstPlan)
                : firstPlan;
            const copyAccounts = remembered
                ? clampInt(
                      remembered.copyAccounts,
                      1,
                      firm.maxFundedAccounts(plan),
                      1,
                  )
                : 1;
            return {
                ...state,
                copyAccounts,
                firm,
                firmMemory: memoryWithCurrent,
                plan,
            };
        }
        case CalculatorActionType.SetFundedHorizonDays: {
            return {
                ...state,
                fundedHorizonDays: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.fundedDays.min,
                    CALCULATOR_SCALAR_BOUNDS.fundedDays.max,
                    state.fundedHorizonDays,
                ),
            };
        }
        case CalculatorActionType.SetIdleDayProbability: {
            return {
                ...state,
                idleDayProbability: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.idle.min,
                    CALCULATOR_SCALAR_BOUNDS.idle.max,
                    state.idleDayProbability,
                ),
            };
        }
        case CalculatorActionType.SetInstrument: {
            return { ...state, instrument: action.instrument };
        }
        case CalculatorActionType.SetLabScenarios: {
            return { ...state, labScenarios: action.entries };
        }
        case CalculatorActionType.SetLinkActivationDiscount: {
            return { ...state, linkActivationDiscount: action.isLinked };
        }
        case CalculatorActionType.SetMaxAttempts: {
            return {
                ...state,
                maxAttempts: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.attempts.min,
                    CALCULATOR_SCALAR_BOUNDS.attempts.max,
                    state.maxAttempts,
                ),
            };
        }
        case CalculatorActionType.SetMaxEvalDays: {
            return {
                ...state,
                maxEvalDays: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.maxDays.min,
                    CALCULATOR_SCALAR_BOUNDS.maxDays.max,
                    state.maxEvalDays,
                ),
            };
        }
        case CalculatorActionType.SetMonthlySubscriptionDiscountPercent: {
            return {
                ...state,
                monthlySubscriptionDiscountPercent: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.msub.min,
                    CALCULATOR_SCALAR_BOUNDS.msub.max,
                    state.monthlySubscriptionDiscountPercent,
                ),
            };
        }
        case CalculatorActionType.SetPayoutRequestSize: {
            return {
                ...state,
                payoutRequestSize:
                    action.value === null
                        ? null
                        : clampNumber(
                              action.value,
                              CALCULATOR_SCALAR_BOUNDS.pr.min,
                              CALCULATOR_SCALAR_BOUNDS.pr.max,
                              state.payoutRequestSize ??
                                  CALCULATOR_SCALAR_BOUNDS.pr.fallback,
                          ),
            };
        }
        case CalculatorActionType.SetPlan: {
            const { plan } = action;
            const cap = state.firm.maxFundedAccounts(plan);
            const copyAccounts = Math.min(state.copyAccounts, cap);
            return {
                ...state,
                copyAccounts,
                firmMemory: {
                    ...state.firmMemory,
                    [state.firm.id]: { copyAccounts, planId: plan.id },
                },
                plan,
            };
        }
        case CalculatorActionType.SetPortfolio: {
            return { ...state, portfolio: action.entries };
        }
        case CalculatorActionType.SetResetDiscountPercent: {
            return {
                ...state,
                resetDiscountPercent: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.rstd.min,
                    CALCULATOR_SCALAR_BOUNDS.rstd.max,
                    state.resetDiscountPercent,
                ),
            };
        }
        case CalculatorActionType.SetRetainedCushion: {
            return {
                ...state,
                retainedCushion:
                    action.value === null
                        ? null
                        : clampNumber(
                              action.value,
                              CALCULATOR_SCALAR_BOUNDS.rc.min,
                              CALCULATOR_SCALAR_BOUNDS.rc.max,
                              state.retainedCushion ??
                                  CALCULATOR_SCALAR_BOUNDS.rc.fallback,
                          ),
            };
        }
        case CalculatorActionType.SetRiskDollars: {
            return {
                ...state,
                riskDollars: clampNumber(
                    action.value,
                    1,
                    state.plan.accountSize,
                    state.riskDollars,
                ),
            };
        }
        case CalculatorActionType.SetRiskPercent: {
            return {
                ...state,
                riskPercent: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.rp.min,
                    CALCULATOR_SCALAR_BOUNDS.rp.max,
                    state.riskPercent,
                ),
            };
        }
        case CalculatorActionType.SetRrRatio: {
            return {
                ...state,
                rrRatio: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.rr.min,
                    CALCULATOR_SCALAR_BOUNDS.rr.max,
                    state.rrRatio,
                ),
            };
        }
        case CalculatorActionType.SetRungSizing: {
            return { ...state, rungSizing: action.value };
        }
        case CalculatorActionType.SetSeed: {
            return {
                ...state,
                seed: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.seed.min,
                    CALCULATOR_SCALAR_BOUNDS.seed.max,
                    state.seed,
                ),
            };
        }
        case CalculatorActionType.SetSizingMode: {
            return { ...state, sizingMode: action.mode };
        }
        case CalculatorActionType.SetStopPoints: {
            return {
                ...state,
                stopPoints: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.sp.min,
                    CALCULATOR_SCALAR_BOUNDS.sp.max,
                    state.stopPoints ?? CALCULATOR_SCALAR_BOUNDS.sp.fallback,
                ),
            };
        }
        case CalculatorActionType.SetTradesPerDay: {
            return {
                ...state,
                tradesPerDay: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.tpd.min,
                    CALCULATOR_SCALAR_BOUNDS.tpd.max,
                    state.tradesPerDay,
                ),
            };
        }
        case CalculatorActionType.SetTrials: {
            return {
                ...state,
                trials: clampInt(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.trials.min,
                    CALCULATOR_SCALAR_BOUNDS.trials.max,
                    state.trials,
                ),
            };
        }
        case CalculatorActionType.SetWinrate: {
            return {
                ...state,
                winrate: clampNumber(
                    action.value,
                    CALCULATOR_SCALAR_BOUNDS.wr.min,
                    CALCULATOR_SCALAR_BOUNDS.wr.max,
                    state.winrate,
                ),
            };
        }
        case CalculatorActionType.UpdateLabScenario: {
            return {
                ...state,
                labScenarios: state.labScenarios.map((sc) =>
                    sc.id === action.id ? { ...sc, ...action.patch } : sc,
                ),
            };
        }
    }
}

export function defaultCalculatorState(): CalculatorState {
    return {
        activationDiscountPercent: 0,
        commissionPerRoundTrip: 0,
        copyAccounts: 1,
        dayStop: { kind: DayStopRuleKind.None },
        evalDayPolicy: null,
        evalDiscountPercent: 0,
        firm: DEFAULT_FIRM,
        firmMemory: {},
        fundedHorizonDays: 60,
        idleDayProbability: 0,
        instrument: null,
        labScenarios: buildDefaultLabScenarios(),
        linkActivationDiscount: false,
        maxAttempts: 1,
        maxEvalDays: 60,
        monthlySubscriptionDiscountPercent: 0,
        payoutRequestSize: null,
        plan: DEFAULT_PLAN,
        portfolio: [
            {
                activationDiscountPercent: 0,
                count: 20,
                evalDiscountPercent: 0,
                firmId: FirmId.Apex,
                id: 'default-apex-50k-eod',
                instrument: null,
                linkActivationDiscount: false,
                monthlySubscriptionDiscountPercent: 0,
                planId: {
                    accountSize: 50_000,
                    firm: FirmId.Apex,
                    variant: ApexVariant.Eod,
                },
                resetDiscountPercent: 0,
                stopPoints: null,
            },
        ],
        resetDiscountPercent: 0,
        retainedCushion: null,
        riskDollars: 250,
        riskPercent: 0.5,
        rrRatio: 2,
        rungSizing: DEFAULT_RUNG_SIZING,
        seed: 42,
        sizingMode: SizingMode.Dollar,
        stopPoints: null,
        tradesPerDay: 1,
        trials: 2000,
        winrate: 0.4,
    };
}

function defaultLabScenario(): LabScenario {
    return {
        accounts: 10,
        correlation: CorrelationMode.Copy,
        dayStop: { kind: DayStopRuleKind.None },
        groups: 1,
        id: freshId(),
        instrument: null,
        label: 'New scenario',
        riskPerTrade: 250,
        rrRatio: 2,
        stopPoints: null,
        tradesPerDay: 1,
        winrate: 0.4,
    };
}

function freshId(): string {
    return typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `lab-${Math.random().toString(36).slice(2, 11)}`;
}
