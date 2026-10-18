import {
    DailyLossLimitKind,
    dollars,
    fraction,
    type Plan,
    scaleDailyLossLimit,
} from '~/lib/prop-calculator';

export interface StressScenario {
    isNoOp: boolean;
    label: string;
    plan: Plan;
}

export function buildStressScenarios(basePlan: Plan): StressScenario[] {
    return [
        { isNoOp: false, label: 'Baseline', plan: basePlan },
        buildDllHalvedScenario(basePlan),
        buildLadderCutScenario(basePlan),
        buildSafetyNetScenario(basePlan),
        buildQualifyingBarScenario(basePlan),
    ];
}

function buildDllHalvedScenario(basePlan: Plan): StressScenario {
    const isNoOp =
        basePlan.evalDailyLossLimit.kind === DailyLossLimitKind.None &&
        basePlan.fundedDailyLossLimit.kind === DailyLossLimitKind.None;
    return {
        isNoOp,
        label: 'DLL ×0.5',
        plan: basePlan.withOverrides({
            evalDailyLossLimit: scaleDailyLossLimit(
                basePlan.evalDailyLossLimit,
                fraction(0.5),
            ),
            fundedDailyLossLimit: scaleDailyLossLimit(
                basePlan.fundedDailyLossLimit,
                fraction(0.5),
            ),
        }),
    };
}

function buildLadderCutScenario(basePlan: Plan): StressScenario {
    if (basePlan.payoutLadder) {
        const ladder = basePlan.payoutLadder;
        return {
            isNoOp: false,
            label: 'Payout ladder −20%',
            plan: basePlan.withOverrides({
                payoutLadder: {
                    ...ladder,
                    steps: ladder.steps.map((step) => step * 0.8),
                },
            }),
        };
    }
    return {
        isNoOp: false,
        label: 'Payout share −20%',
        plan: basePlan.withScaledTraderShare(fraction(0.8)),
    };
}

function buildQualifyingBarScenario(basePlan: Plan): StressScenario {
    return basePlan.minQualifyingDayProfit === null
        ? {
              isNoOp: false,
              label: 'Profit target +40% (proxy)',
              plan: basePlan.withOverrides({
                  profitTarget: dollars(basePlan.profitTarget * 1.4),
              }),
          }
        : {
              isNoOp: false,
              label: 'Qualifying bar +40%',
              plan: basePlan.withOverrides({
                  minQualifyingDayProfit: dollars(
                      basePlan.minQualifyingDayProfit * 1.4,
                  ),
              }),
          };
}

function buildSafetyNetScenario(basePlan: Plan): StressScenario {
    return {
        isNoOp: false,
        label: 'Safety net ×1.5',
        plan: basePlan.withOverrides({
            minPayoutProfit: dollars(basePlan.minPayoutProfit * 1.5),
            minPayoutProfitPerCycle:
                basePlan.minPayoutProfitPerCycle === null
                    ? undefined
                    : dollars(basePlan.minPayoutProfitPerCycle * 1.5),
        }),
    };
}
