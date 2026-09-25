import { defineCommand } from 'citty';

import {
    ContractUnit,
    describeDll,
    describeFundedContracts,
    describeShare,
    planArguments,
    planResolver,
    planVariant,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    type ContractLimits,
    describePayoutDayGate,
    type DrawdownStrategy,
    findFirm,
    type FirmId,
    type PayoutCapRegime,
    type PayoutCapSchedule,
    PayoutCapScheduleKind,
    type PayoutCountTieredPayoutSplit,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    TradingPhase,
} from '~/lib/prop-calculator';

export default defineCommand({
    args: {
        ...planArguments,
        variants: {
            default: false,
            description: 'Print only firm and variant, one per line',
            type: 'boolean',
        },
    },
    meta: {
        description:
            'Show the validated rule set for each plan. Filter with --firm and --variant.',
        name: 'plans',
    },
    run(context) {
        try {
            const plans = planResolver.resolveMany(context.args);

            if (context.args.variants) {
                for (const plan of plans) {
                    process.stdout.write(
                        `${plan.id.firm}\t${planVariant(plan)}\n`,
                    );
                }
                return;
            }

            let firm: FirmId | undefined;
            for (const plan of plans) {
                if (firm !== plan.id.firm) {
                    firm = plan.id.firm;
                    ui.heading(firm);
                    const firmNotes = findFirm(firm)?.notes ?? [];
                    for (const note of firmNotes) {
                        ui.warn(note);
                    }
                }
                ui.note(planHeadline(plan));
                for (const line of planRuleLines(plan)) {
                    ui.muted(line);
                }
            }
            ui.muted(`\n${plans.length} plan(s)`);
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function describePayoutSplit(
    split: PayoutCountTieredPayoutSplit,
): string {
    const steps = split.schedule;
    if (steps.length === 1) {
        return formatPercent(steps[0]?.tiers[0]?.traderShare ?? 0, 0);
    }
    return steps
        .map((step, index) => {
            const share = formatPercent(step.tiers[0]?.traderShare ?? 0, 0);
            const first = step.fromPayoutIndex + 1;
            const next = steps[index + 1];
            if (next === undefined) return `${share} (payout ${first}+)`;
            const last = next.fromPayoutIndex;
            return first === last
                ? `${share} (payout ${first})`
                : `${share} (payouts ${first}-${last})`;
        })
        .join(', ');
}

export function planHeadline(plan: Plan): string {
    const headline = `${plan.label}  --firm ${plan.id.firm} --variant ${planVariant(plan)}`;
    return plan.isPurchasable
        ? headline
        : `${headline}  [${PLAN_AVAILABILITY_LABEL[plan.availability]}]`;
}

export function planRuleLines(plan: Plan): string[] {
    const consistencyEval = plan.evalConsistencyRule();
    const consistencyFunded = plan.fundedConsistencyRule();
    const limits = plan.contractLimits;
    const evalDrawdownText = describeDrawdown(
        plan.drawdown,
        plan.accountSize,
        PayoutFloorEffect.None,
    );
    const fundedDrawdownText = describeDrawdown(
        plan.fundedDrawdown,
        plan.accountSize,
        plan.payoutFloorEffect,
    );
    const hasSeparateFundedDrawdown =
        !plan.isInstantFunded && evalDrawdownText !== fundedDrawdownText;
    const drawdownSegment = plan.isInstantFunded
        ? `drawdown ${fundedDrawdownText}`
        : hasSeparateFundedDrawdown
          ? `eval drawdown ${evalDrawdownText}`
          : `drawdown ${evalDrawdownText}`;
    const payoutCapLine = describePayoutCapSchedule(plan.payoutCapSchedule());

    return [
        [
            plan.isInstantFunded
                ? '    instant-funded, no evaluation phase'
                : `    target ${formatCurrency(plan.profitTarget)}`,
            drawdownSegment,
            plan.isInstantFunded
                ? `min days ${plan.minTradingDays} (unused)`
                : `min days ${plan.minTradingDays}`,
        ].join(' | '),
        ...(hasSeparateFundedDrawdown
            ? [`    funded drawdown ${fundedDrawdownText}`]
            : []),
        [
            `    eval DLL ${plan.isInstantFunded ? NOT_APPLICABLE : describeDll(plan.evalDailyLossLimit, plan.isDailyLossLimitTerminating(TradingPhase.Eval))}`,
            `funded DLL ${describeDll(plan.fundedDailyLossLimit, plan.isDailyLossLimitTerminating(TradingPhase.Funded))}`,
            `consistency eval ${plan.isInstantFunded ? NOT_APPLICABLE : describeShare(consistencyEval)}`,
            `funded ${describeShare(consistencyFunded)}`,
        ].join(' | '),
        [
            `    contracts ${plan.isInstantFunded ? NOT_APPLICABLE : limits ? `${limits.evalMinis} ${ContractUnit.Mini} / ${limits.evalMicros ?? '?'} ${ContractUnit.Micro}` : 'not recorded'}`,
            `funded ${describeFundedLimits(limits)}`,
        ].join(' | '),
        [
            `    fees eval ${formatCurrency(plan.fees.oneTimeEval)}`,
            `activation ${formatCurrency(plan.fees.activation)}`,
            `monthly ${formatCurrency(plan.fees.monthlySubscription)}`,
            `reset ${formatCurrency(plan.fees.reset)}`,
        ].join(' | '),
        [
            `    payout split ${describePayoutSplit(plan.payoutSplit)}`,
            `first ${formatCurrency(plan.minPayoutProfit)}`,
            ...(plan.minPayoutProfitPerCycle === null
                ? []
                : [
                      `per cycle ${formatGateCurrency(plan.minPayoutProfitPerCycle)}`,
                  ]),
            `min request ${formatCurrency(plan.minPayoutRequest)}`,
            `day gate ${describePayoutDayGate(plan)}`,
            ...qualifyingDayQualifier(plan),
        ].join(' | '),
        ...(plan.payoutBuffer === null
            ? []
            : [
                  `    payout buffer: EOD balance must clear ${formatCurrency(
                      plan.payoutBuffer.requiredBalance(
                          plan.accountSize,
                          plan.fundedDrawdown.amount,
                      ),
                  )}`,
              ]),
        ...(payoutCapLine === null ? [] : [payoutCapLine]),
        ...(plan.payoutLadder
            ? [
                  `    payout ladder [${plan.payoutLadder.steps.join(', ')}] min request ${formatCurrency(plan.payoutLadder.minRequestAmount)}`,
              ]
            : []),
        ...(plan.payoutProfitShare === null
            ? []
            : [
                  `    per-request cap ${formatPercent(plan.payoutProfitShare, 0)} of cycle profit`,
              ]),
    ];
}

function describeDrawdown(
    drawdown: DrawdownStrategy,
    startingBalance: number,
    payoutFloorEffect: PayoutFloorEffect,
): string {
    const base = `${formatCurrency(drawdown.amount)} ${drawdown.kind}`;
    const lock = drawdown.lock;
    if (lock === undefined) {
        return `${base}, no lock${describePayoutFloorEffect(payoutFloorEffect)}`;
    }
    const lockFloor = describeLockFloor(
        lock.lockedThreshold(startingBalance) - startingBalance,
    );
    return lock.atProfit === null
        ? `${base}, locks on first payout to ${lockFloor}`
        : `${base}, locks at +${formatCurrency(lock.atProfit)} to ${lockFloor}${describePayoutFloorEffect(payoutFloorEffect)}`;
}

function describeFundedLimits(limits: ContractLimits | null): string {
    return limits === null ||
        (limits.fundedMinis === null && limits.fundedMicros === null)
        ? 'unpublished'
        : `${describeFundedContracts(limits.fundedMinis, ContractUnit.Mini)} / ${describeFundedContracts(limits.fundedMicros, ContractUnit.Micro)}`;
}

function describeLockFloor(offset: number): string {
    if (offset === 0) return 'breakeven';
    return offset > 0
        ? `+${formatCurrency(offset)}`
        : `-${formatCurrency(-offset)}`;
}

function describePayoutCapRegime(regime: PayoutCapRegime): string {
    const parts = [
        regime.balanceShareCap === null
            ? null
            : `${formatPercent(regime.balanceShareCap, 0)} of total profit`,
        regime.requestCap === null
            ? null
            : `max ${formatCurrency(regime.requestCap)} per request`,
    ].filter((part) => part !== null);
    return parts.length === 0 ? 'uncapped' : parts.join(', ');
}

function describePayoutCapSchedule(schedule: PayoutCapSchedule): null | string {
    switch (schedule.kind) {
        case PayoutCapScheduleKind.ByPayoutCount: {
            return `    payout cap by payout: ${schedule.steps.map((step) => `#${step.from + 1}+ ${describePayoutCapRegime(step.regime)}`).join(' | ')}`;
        }
        case PayoutCapScheduleKind.ByQualifyingDays: {
            return `    payout cap by qualifying days: ${schedule.steps.map((step) => `day ${step.from}+ ${describePayoutCapRegime(step.regime)}`).join(' | ')}`;
        }
        case PayoutCapScheduleKind.Flat: {
            return schedule.regime.balanceShareCap === null &&
                schedule.regime.requestCap === null
                ? null
                : `    payout cap ${describePayoutCapRegime(schedule.regime)}`;
        }
    }
}

function describePayoutFloorEffect(effect: PayoutFloorEffect): string {
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor: {
            return ' or on 1st payout';
        }
        case PayoutFloorEffect.MoveToLockedFloor: {
            return ', moved there exactly on 1st payout';
        }
        case PayoutFloorEffect.None: {
            return '';
        }
        case PayoutFloorEffect.ReleaseFloor: {
            return ', floor reset to breakeven on each payout';
        }
    }
}

function qualifyingDayQualifier(plan: Plan): string[] {
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            return [];
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            return [
                plan.minQualifyingDayProfit === null
                    ? 'any day counts'
                    : `winning day >= ${formatCurrency(plan.minQualifyingDayProfit)}`,
            ];
        }
    }
}
