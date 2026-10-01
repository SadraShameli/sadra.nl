import {
    formatCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    type AccountConclusionSource,
    type ConsistencyRule,
    type ContractLimitConfig,
    ContractLimitKind,
    type ContractLimits,
    type DailyLossLimitConfig,
    type DailyLossLimitDescriptor,
    DailyLossLimitShape,
    describeDailyLossLimit,
    describeFundedResetTerms,
    describePayoutDayGate,
    type DrawdownStrategy,
    LifetimeCapScope,
    lifetimePayoutCountLimit,
    type PayoutCapRegime,
    type PayoutCapSchedule,
    PayoutCapScheduleKind,
    type PayoutCountTieredPayoutSplit,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    PayoutGate,
    type Plan,
    retryPath,
    TradingPhase,
} from '~/lib/prop-calculator/core';

export enum ContractUnit {
    Micro = 'micro',
    Mini = 'mini',
}

export enum PlanRuleSegmentKind {
    ActivationFee = 'activation-fee',
    Conclusion = 'conclusion',
    Drawdown = 'drawdown',
    EvalBreach = 'eval-breach',
    EvalConsistency = 'eval-consistency',
    EvalContracts = 'eval-contracts',
    EvalDailyLossLimit = 'eval-daily-loss-limit',
    EvalDrawdown = 'eval-drawdown',
    EvalFee = 'eval-fee',
    FirstPayoutGate = 'first-payout-gate',
    FundedBreach = 'funded-breach',
    FundedConsistency = 'funded-consistency',
    FundedContracts = 'funded-contracts',
    FundedDailyLossLimit = 'funded-daily-loss-limit',
    FundedDrawdown = 'funded-drawdown',
    InstantFunded = 'instant-funded',
    MinPayoutRequest = 'min-payout-request',
    MinTradingDays = 'min-trading-days',
    MonthlyFee = 'monthly-fee',
    PayoutBuffer = 'payout-buffer',
    PayoutCap = 'payout-cap',
    PayoutDayGate = 'payout-day-gate',
    PayoutLadder = 'payout-ladder',
    PayoutProfitShare = 'payout-profit-share',
    PayoutSplit = 'payout-split',
    PerCyclePayoutGate = 'per-cycle-payout-gate',
    ProfitTarget = 'profit-target',
    QualifyingDay = 'qualifying-day',
    ResetFee = 'reset-fee',
}

export interface PlanConsistencyLabels {
    readonly eval: null | string;
    readonly funded: null | string;
}

export type PlanRuleLine = readonly PlanRuleSegment[];

export interface PlanRuleSegment {
    readonly kind: PlanRuleSegmentKind;
    readonly term: null | string;
    readonly value: string;
}

export const PLAN_RULE_SEGMENT_LABEL: Readonly<
    Record<PlanRuleSegmentKind, string>
> = {
    [PlanRuleSegmentKind.ActivationFee]: 'Activation fee',
    [PlanRuleSegmentKind.Conclusion]: 'Account conclusion',
    [PlanRuleSegmentKind.Drawdown]: 'Drawdown',
    [PlanRuleSegmentKind.EvalBreach]: 'On eval breach',
    [PlanRuleSegmentKind.EvalConsistency]: 'Eval consistency',
    [PlanRuleSegmentKind.EvalContracts]: 'Eval contracts',
    [PlanRuleSegmentKind.EvalDailyLossLimit]: 'Eval daily loss limit',
    [PlanRuleSegmentKind.EvalDrawdown]: 'Eval drawdown',
    [PlanRuleSegmentKind.EvalFee]: 'Eval fee',
    [PlanRuleSegmentKind.FirstPayoutGate]: 'First payout profit',
    [PlanRuleSegmentKind.FundedBreach]: 'On funded breach',
    [PlanRuleSegmentKind.FundedConsistency]: 'Funded consistency',
    [PlanRuleSegmentKind.FundedContracts]: 'Funded contracts',
    [PlanRuleSegmentKind.FundedDailyLossLimit]: 'Funded daily loss limit',
    [PlanRuleSegmentKind.FundedDrawdown]: 'Funded drawdown',
    [PlanRuleSegmentKind.InstantFunded]: 'Evaluation',
    [PlanRuleSegmentKind.MinPayoutRequest]: 'Minimum payout request',
    [PlanRuleSegmentKind.MinTradingDays]: 'Minimum trading days',
    [PlanRuleSegmentKind.MonthlyFee]: 'Monthly fee',
    [PlanRuleSegmentKind.PayoutBuffer]: 'Payout buffer',
    [PlanRuleSegmentKind.PayoutCap]: 'Payout cap',
    [PlanRuleSegmentKind.PayoutDayGate]: 'Payout day gate',
    [PlanRuleSegmentKind.PayoutLadder]: 'Payout ladder',
    [PlanRuleSegmentKind.PayoutProfitShare]: 'Per-request cap',
    [PlanRuleSegmentKind.PayoutSplit]: 'Payout split',
    [PlanRuleSegmentKind.PerCyclePayoutGate]: 'Profit per payout cycle',
    [PlanRuleSegmentKind.ProfitTarget]: 'Profit target',
    [PlanRuleSegmentKind.QualifyingDay]: 'Qualifying day',
    [PlanRuleSegmentKind.ResetFee]: 'Reset fee',
};

const CLOSED_ACCOUNT = 'account closed; the next purchase refills the slot';

const NO_FUNDED_RESET = `no funded reset modeled: ${CLOSED_ACCOUNT}`;

const NO_LIFETIME_LIMIT = 'no lifetime payout limit modeled';

const NO_RULE = 'none';

export function describeDll(
    config: DailyLossLimitConfig,
    isTerminating: boolean,
): string {
    const shape = describeDllShape(describeDailyLossLimit(config));
    return isTerminating ? `${shape} (hard)` : shape;
}

export function describeFundedContracts(
    config: ContractLimitConfig | null,
    unit: ContractUnit,
): string {
    if (config === null) return `? ${unit}`;
    switch (config.kind) {
        case ContractLimitKind.Flat: {
            return `${config.maxContracts} ${unit}`;
        }
        case ContractLimitKind.Tiered: {
            return `up to ${config.tiers.at(-1)?.maxContracts ?? '?'} ${unit} (tiered)`;
        }
    }
}

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

export function describePlanRules(plan: Plan): readonly PlanRuleLine[] {
    const consistency = planConsistencyLabels(plan);
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
    const payoutCap = payoutCapSegment(plan.payoutCapSchedule());

    return [
        [
            plan.isInstantFunded
                ? segment(
                      PlanRuleSegmentKind.InstantFunded,
                      null,
                      'instant-funded, no evaluation phase',
                  )
                : segment(
                      PlanRuleSegmentKind.ProfitTarget,
                      'target',
                      formatCurrency(plan.profitTarget),
                  ),
            plan.isInstantFunded
                ? segment(
                      PlanRuleSegmentKind.Drawdown,
                      'drawdown',
                      fundedDrawdownText,
                  )
                : hasSeparateFundedDrawdown
                  ? segment(
                        PlanRuleSegmentKind.EvalDrawdown,
                        'eval drawdown',
                        evalDrawdownText,
                    )
                  : segment(
                        PlanRuleSegmentKind.Drawdown,
                        'drawdown',
                        evalDrawdownText,
                    ),
            segment(
                PlanRuleSegmentKind.MinTradingDays,
                'min days',
                plan.isInstantFunded
                    ? `${plan.minTradingDays} (unused)`
                    : String(plan.minTradingDays),
            ),
        ],
        ...(hasSeparateFundedDrawdown
            ? [
                  [
                      segment(
                          PlanRuleSegmentKind.FundedDrawdown,
                          'funded drawdown',
                          fundedDrawdownText,
                      ),
                  ],
              ]
            : []),
        [
            segment(
                PlanRuleSegmentKind.EvalDailyLossLimit,
                'eval DLL',
                plan.isInstantFunded
                    ? NOT_APPLICABLE
                    : describeDll(
                          plan.evalDailyLossLimit,
                          plan.isDailyLossLimitTerminating(TradingPhase.Eval),
                      ),
            ),
            segment(
                PlanRuleSegmentKind.FundedDailyLossLimit,
                'funded DLL',
                describeDll(
                    plan.fundedDailyLossLimit,
                    plan.isDailyLossLimitTerminating(TradingPhase.Funded),
                ),
            ),
            segment(
                PlanRuleSegmentKind.EvalConsistency,
                'consistency eval',
                plan.isInstantFunded
                    ? NOT_APPLICABLE
                    : (consistency.eval ?? NO_RULE),
            ),
            segment(
                PlanRuleSegmentKind.FundedConsistency,
                'funded',
                consistency.funded ?? NO_RULE,
            ),
        ],
        [
            segment(
                PlanRuleSegmentKind.EvalContracts,
                'contracts',
                describeEvalLimits(plan, limits),
            ),
            segment(
                PlanRuleSegmentKind.FundedContracts,
                'funded',
                describeFundedLimits(limits),
            ),
        ],
        [
            segment(
                PlanRuleSegmentKind.EvalFee,
                'fees eval',
                formatCurrency(plan.fees.oneTimeEval),
            ),
            segment(
                PlanRuleSegmentKind.ActivationFee,
                'activation',
                formatCurrency(plan.fees.activation),
            ),
            segment(
                PlanRuleSegmentKind.MonthlyFee,
                'monthly',
                formatCurrency(plan.fees.monthlySubscription),
            ),
            segment(
                PlanRuleSegmentKind.ResetFee,
                'reset',
                formatCurrency(plan.fees.reset),
            ),
        ],
        [
            segment(
                PlanRuleSegmentKind.PayoutSplit,
                'payout split',
                describePayoutSplit(plan.payoutSplit),
            ),
            segment(
                PlanRuleSegmentKind.FirstPayoutGate,
                'first',
                formatCurrency(plan.minPayoutProfit),
            ),
            ...(plan.minPayoutProfitPerCycle === null
                ? []
                : [
                      segment(
                          PlanRuleSegmentKind.PerCyclePayoutGate,
                          'per cycle',
                          formatGateCurrency(plan.minPayoutProfitPerCycle),
                      ),
                  ]),
            segment(
                PlanRuleSegmentKind.MinPayoutRequest,
                'min request',
                formatCurrency(plan.minPayoutRequest),
            ),
            segment(
                PlanRuleSegmentKind.PayoutDayGate,
                'day gate',
                describePayoutDayGate(plan),
            ),
            ...qualifyingDaySegments(plan),
        ],
        ...(plan.payoutBuffer === null
            ? []
            : [
                  [
                      segment(
                          PlanRuleSegmentKind.PayoutBuffer,
                          'payout buffer:',
                          `EOD balance must clear ${formatCurrency(
                              plan.payoutBuffer.requiredBalance(
                                  plan.accountSize,
                                  plan.fundedDrawdown.amount,
                              ),
                          )}`,
                      ),
                  ],
              ]),
        ...(payoutCap === null ? [] : [[payoutCap]]),
        ...(plan.payoutLadder
            ? [
                  [
                      segment(
                          PlanRuleSegmentKind.PayoutLadder,
                          'payout ladder',
                          `[${plan.payoutLadder.steps.join(', ')}] min request ${formatCurrency(plan.payoutLadder.minRequestAmount)}`,
                      ),
                  ],
              ]
            : []),
        ...(plan.payoutProfitShare === null
            ? []
            : [
                  [
                      segment(
                          PlanRuleSegmentKind.PayoutProfitShare,
                          'per-request cap',
                          `${formatPercent(plan.payoutProfitShare, 0)} of cycle profit`,
                      ),
                  ],
              ]),
        [
            segment(
                PlanRuleSegmentKind.EvalBreach,
                'on breach: eval',
                plan.isInstantFunded
                    ? NOT_APPLICABLE
                    : `${retryPath(plan.fees)} ${formatCurrency(plan.retryFee())}`,
            ),
            segment(
                PlanRuleSegmentKind.FundedBreach,
                'funded',
                plan.fundedReset === null
                    ? NO_FUNDED_RESET
                    : `${describeFundedResetTerms(plan.fundedReset)}; otherwise ${CLOSED_ACCOUNT}`,
            ),
            segment(
                PlanRuleSegmentKind.Conclusion,
                null,
                describeConclusion(plan),
            ),
        ],
    ];
}

export function describeShare(
    rule: ConsistencyRule | null | undefined,
): string {
    return consistencyShareLabel(rule) ?? NO_RULE;
}

export function formatPlanRuleLine(line: PlanRuleLine): string {
    return line
        .map((part) =>
            part.term === null ? part.value : `${part.term} ${part.value}`,
        )
        .join(' | ');
}

export function planConsistencyLabels(plan: Plan): PlanConsistencyLabels {
    return {
        eval: plan.isInstantFunded
            ? null
            : consistencyShareLabel(plan.evalConsistencyRule()),
        funded: consistencyShareLabel(plan.fundedConsistencyRule()),
    };
}

function consistencyShareLabel(
    rule: ConsistencyRule | null | undefined,
): null | string {
    return rule === null || rule === undefined ? null : rule.shareLabel();
}

function describeConclusion(plan: Plan): string {
    const conclusion = plan.lifetimeConclusion;
    const dollarCap = conclusion.maxLifetimePayoutDollars;
    const limits = [
        describePayoutCountLimit(conclusion),
        dollarCap === null || conclusion.dollarCapScope === null
            ? null
            : `at ${formatCurrency(dollarCap)} in lifetime payouts (${dollarCapScopeNote(plan, conclusion.dollarCapScope)})`,
    ].filter((limit) => limit !== null);
    return limits.length === 0
        ? NO_LIFETIME_LIMIT
        : `account concludes ${limits.join(' or ')}`;
}

function describeDllShape(descriptor: DailyLossLimitDescriptor): string {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed: {
            return `$${descriptor.amount}`;
        }
        case DailyLossLimitShape.None: {
            return 'none';
        }
        case DailyLossLimitShape.Range: {
            return `$${descriptor.min}-$${descriptor.max}`;
        }
        case DailyLossLimitShape.RangeWithUnlimitedTier: {
            const limited =
                descriptor.max <= descriptor.min
                    ? `$${descriptor.min}`
                    : `$${descriptor.min}-$${descriptor.max}`;
            return `${limited}, none on some tiers`;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return `${descriptor.share * 100}% peak`;
        }
        case DailyLossLimitShape.Staged: {
            return `${describeDllShape(descriptor.before)} -> ${describeDllShape(descriptor.after)}`;
        }
    }
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

function describeEvalLimits(plan: Plan, limits: ContractLimits | null): string {
    if (plan.isInstantFunded) return NOT_APPLICABLE;
    return limits
        ? `${limits.evalMinis} ${ContractUnit.Mini} / ${limits.evalMicros ?? '?'} ${ContractUnit.Micro}`
        : 'not recorded';
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

function describePayoutCountLimit(
    conclusion: AccountConclusionSource,
): null | string {
    const limit = lifetimePayoutCountLimit(conclusion);
    if (limit === null) return null;
    switch (limit.gate) {
        case PayoutGate.AccountConcluded: {
            return `after ${limit.count} payouts`;
        }
        case PayoutGate.LadderExhausted: {
            return `after the ${limit.count}-step payout ladder`;
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

function dollarCapScopeNote(plan: Plan, scope: LifetimeCapScope): string {
    switch (scope) {
        case LifetimeCapScope.PerAccount: {
            return 'per account';
        }
        case LifetimeCapScope.PerUserAcrossVariant: {
            return `per user across all ${variantAccountsLabel(plan)}`;
        }
        case LifetimeCapScope.Unconfirmed: {
            return 'scope not stated by the firm';
        }
    }
}

function payoutCapSegment(schedule: PayoutCapSchedule): null | PlanRuleSegment {
    switch (schedule.kind) {
        case PayoutCapScheduleKind.ByPayoutCount: {
            return segment(
                PlanRuleSegmentKind.PayoutCap,
                'payout cap',
                `by payout: ${schedule.steps.map((step) => `#${step.from + 1}+ ${describePayoutCapRegime(step.regime)}`).join(' | ')}`,
            );
        }
        case PayoutCapScheduleKind.ByQualifyingDays: {
            return segment(
                PlanRuleSegmentKind.PayoutCap,
                'payout cap',
                `by qualifying days: ${schedule.steps.map((step) => `day ${step.from}+ ${describePayoutCapRegime(step.regime)}`).join(' | ')}`,
            );
        }
        case PayoutCapScheduleKind.Flat: {
            return schedule.regime.balanceShareCap === null &&
                schedule.regime.requestCap === null
                ? null
                : segment(
                      PlanRuleSegmentKind.PayoutCap,
                      'payout cap',
                      describePayoutCapRegime(schedule.regime),
                  );
        }
    }
}

function qualifyingDaySegments(plan: Plan): PlanRuleSegment[] {
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            return [];
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            return [
                segment(
                    PlanRuleSegmentKind.QualifyingDay,
                    null,
                    plan.minQualifyingDayProfit === null
                        ? 'any day counts'
                        : `winning day >= ${formatCurrency(plan.minQualifyingDayProfit)}`,
                ),
            ];
        }
    }
}

function segment(
    kind: PlanRuleSegmentKind,
    term: null | string,
    value: string,
): PlanRuleSegment {
    return { kind, term, value };
}

const KEBAB_SEGMENT_ACRONYMS = new Set(['dll', 'eod']);

function titleCaseFromKebab(value: string): string {
    return value
        .split('-')
        .map((word) =>
            KEBAB_SEGMENT_ACRONYMS.has(word)
                ? word.toUpperCase()
                : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
        )
        .join(' ');
}

function variantAccountsLabel(plan: Plan): string {
    return 'variant' in plan.id
        ? `${titleCaseFromKebab(plan.id.variant)} accounts`
        : 'accounts on this plan';
}
