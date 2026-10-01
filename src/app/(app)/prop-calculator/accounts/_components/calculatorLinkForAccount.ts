import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { openInSimulatorActions } from '~/app/(app)/prop-calculator/_components/toolNavigation';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    CENTS_PER_DOLLAR,
    effectivePayoutRequest,
    findFirm,
    type FirmId,
    type PlanOptIns,
    PolicySizing,
} from '~/lib/prop-calculator';
import {
    documentedSizingOf,
    type EnginePolicyPositionSizing,
    EvalSizingMode,
    fundedStopRuleToDayStopRule,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { evalStartAccount } from '~/lib/prop-calculator/advisor/value';
import { routes } from '~/lib/site/routes';

export enum AccountCalculatorLinkFlag {
    EvalSizingApproximatedByLadder = 'eval-sizing-approximated-by-ladder',
    FundedRiskUnsized = 'funded-risk-unsized',
}

export interface AccountCalculatorLink {
    readonly flags: readonly AccountCalculatorLinkFlag[];
    readonly href: string;
    readonly label: string;
}

export interface AccountCalculatorLinkInput {
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly positionSizing?: EnginePolicyPositionSizing | null;
    readonly rulebook: RulebookParameters;
    readonly stage: SizingStage;
}

const ACCOUNT_CALCULATOR_LINK_LABEL =
    'Fresh start: the simulator runs this plan from day one with your rulebook, not from the current balance of this account';

export const ACCOUNT_CALCULATOR_LINK_FLAG_TEXT: Readonly<
    Record<AccountCalculatorLinkFlag, string>
> = {
    [AccountCalculatorLinkFlag.EvalSizingApproximatedByLadder]:
        'Your rulebook sizes the eval at the maximum risk, which the simulator link cannot carry. The link approximates it with the documented ladder at a fresh start.',
    [AccountCalculatorLinkFlag.FundedRiskUnsized]:
        'No instrument and stop are set, so the simulator runs the funded risk as a flat dollar amount without whole contracts.',
};

export function calculatorLinkForAccount(
    input: AccountCalculatorLinkInput,
): AccountCalculatorLink | null {
    const { optIns, planSerial, positionSizing, rulebook, stage } = input;
    if (stage === SizingStage.Live) return null;
    const firm = findFirm(input.firmId);
    const plan = firm?.findPlanBySerial(planSerial);
    if (firm === undefined || plan === null || plan === undefined) return null;

    const { funded, payout, strategy } = rulebook;
    const actions: CalculatorAction[] = [
        ...openInSimulatorActions(firm, plan, optIns),
        { entries: [], type: CalculatorActionType.SetLabScenarios },
        { entries: [], type: CalculatorActionType.SetPortfolio },
        { type: CalculatorActionType.SetWinrate, value: strategy.winrate },
        { type: CalculatorActionType.SetRrRatio, value: strategy.rr },
        {
            type: CalculatorActionType.SetTradesPerDay,
            value: strategy.tradesPerDayMax,
        },
        {
            type: CalculatorActionType.SetRiskDollars,
            value: funded.riskCents / CENTS_PER_DOLLAR,
        },
        {
            rule: fundedStopRuleToDayStopRule(funded.stopRule),
            type: CalculatorActionType.SetDayStop,
        },
        {
            type: CalculatorActionType.SetRetainedCushion,
            value: payout.retainedCushionCents / CENTS_PER_DOLLAR,
        },
        {
            type: CalculatorActionType.SetPayoutRequestSize,
            value: effectivePayoutRequest(
                plan,
                payout.requestCents / CENTS_PER_DOLLAR,
            ),
        },
    ];
    const flags: AccountCalculatorLinkFlag[] = [];

    if (positionSizing === null || positionSizing === undefined) {
        flags.push(AccountCalculatorLinkFlag.FundedRiskUnsized);
    } else {
        actions.push(
            {
                instrument: positionSizing.instrument,
                type: CalculatorActionType.SetInstrument,
            },
            {
                type: CalculatorActionType.SetStopPoints,
                value: positionSizing.stopPoints,
            },
        );
    }

    if (stage === SizingStage.Eval) {
        const { rungs, stopRule } = documentedSizingOf(
            evalStartAccount(plan),
            rulebook,
        ).sizing;
        if (rungs.length > 0) {
            actions.push({
                policy: {
                    ladder: rungs.map((rung) => rung.risk),
                    maxLossesPerDay: null,
                    sizing: PolicySizing.ContractCapped,
                    stopRule,
                },
                type: CalculatorActionType.SetEvalDayPolicy,
            });
        }
        if (rulebook.eval.mode === EvalSizingMode.MaxRisk) {
            flags.push(AccountCalculatorLinkFlag.EvalSizingApproximatedByLadder);
        }
    }

    const state = actions.reduce(calculatorReducer, defaultCalculatorState());
    return {
        flags,
        href: `${routes.propCalculator.simulator}?${encodeState(state).toString()}`,
        label: ACCOUNT_CALCULATOR_LINK_LABEL,
    };
}
