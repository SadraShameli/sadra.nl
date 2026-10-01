import {
    type Dollars,
    dollars,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    placedFundedRiskAt,
    points,
    resolvePositionSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';
import { DEFAULT_FUNDED_FLAT_CANDIDATES } from '~/lib/prop-calculator/optimize';
import { type FundedSimStart, type SimInputs } from '~/lib/prop-calculator/simulator';

import { type Advice } from './Advice';
import { adviceProvenance } from './AdviceProvenance';
import { AdviceSource } from './AdviceSource';
import {
    adviceStaleness,
    type AdviceStaleness,
    type PlanRulesFingerprintCheck,
} from './AdviceStaleness';
import { type Assumption } from './Assumption';
import { createDocumentedRule } from './createDocumentedRule';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from './DifferenceReason';
import { NO_COMMISSION } from './DocumentedSizing';
import {
    EngineOptimumRowKind,
    FundedSweepOptimumResultKind,
} from './EngineOptimum';
import {
    type EngineOptimumRequest,
    type FundedSweepFreshRequest,
} from './EngineOptimumRequest';
import {
    type EngineOptimumRunnerResult,
    type FundedFromStateEngineOptimumResult,
    type FundedSweepEngineOptimumResult,
    type PayoutSizeSweepEngineOptimumResult,
} from './EngineOptimumRunner';
import {
    buildEnginePolicy,
    type MeasuredRebuyLag,
} from './EnginePolicyBuilder';
import {
    fundedCycleSeedFromTracker,
    FundedFromStateOptimumResultKind,
    type FundedFromStateSweepRequest,
} from './FundedFromStateSweep';
import { payoutAdvice, type PayoutAdvice } from './PayoutAdvice';
import { type FundedPayoutRuleContext } from './PayoutRequestRule';
import {
    type PayoutSizeSweepRequest,
    PayoutSizeSweepResultKind,
} from './PayoutSizeSweep';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';
import { contractLimitOf, riskCaps, type RiskCaps } from './RiskCaps';
import {
    fundedStopRuleToDayStopRule,
    type RulebookParameters,
} from './Rulebook';
import { documentedRuleLabel, rulebookDeviation } from './RulebookDeviation';
import { type FundedRuleContext, ruleContextAt } from './RuleContext';
import { SizingAdvisor } from './SizingAdvisor';
import { SizingObjective } from './SizingObjective';
import { SizingStage } from './SizingStage';
import { StartBasis } from './StartBasis';

export interface FundedSizingAdvisorInput {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly accountPolicy?: FirmAccountPolicy;
    readonly fundedHorizonDays: number;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
    readonly paidPayoutsSinceLastLiveAccount?: null | number;
    readonly pendingPayouts?: Dollars;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly personalPayoutOverride?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
    readonly planRulesFingerprint?: null | PlanRulesFingerprintCheck;
    readonly positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    };
    readonly rulebook: RulebookParameters;
    readonly seed?: number;
    readonly snapshotAsOf: string;
    readonly today: string;
    readonly trials?: number;
}

const FUNDED_SWEEP_DEFAULT_SIMS = 4000;
const FUNDED_SWEEP_DEFAULT_SEED = 42;
const FUNDED_SWEEP_MAX_EVAL_DAYS = 150;

export class FundedSizingAdvisor extends SizingAdvisor<FundedRuleContext> {
    private readonly input: FundedSizingAdvisorInput;

    constructor(input: FundedSizingAdvisorInput) {
        super(
            SizingStage.Funded,
            input.rulebook,
            createDocumentedRule(SizingStage.Funded, input.rulebook),
        );
        this.input = input;
    }

    private assumptions(): readonly Assumption[] {
        return this.withLiveTriggersNotChecked(this.input.account.assumptions);
    }

    private payoutRuleContext(): FundedPayoutRuleContext | null {
        const {
            account,
            paidPayoutsSinceLastLiveAccount,
            pendingPayouts,
            personalPayoutOverride,
            personalRetainedCushion,
        } = this.input;
        if (account.fundedTracker === null) return null;
        return {
            paidPayoutsSinceLastLiveAccount:
                paidPayoutsSinceLastLiveAccount ?? null,
            pendingPayouts: pendingPayouts ?? dollars(0),
            personalRequestOverride: personalPayoutOverride ?? null,
            personalRetainedCushion: personalRetainedCushion ?? null,
            plan: account.plan,
            stage: SizingStage.Funded,
            state: account.state,
            tracker: account.fundedTracker,
        };
    }

    private placedRisk(): null | {
        contracts: number;
        isCapped: boolean;
    } {
        const { account, positionSizing, rulebook } = this.input;
        if (!positionSizing) return null;
        const resolved = resolvePositionSizing(
            positionSizing.instrument,
            positionSizing.stopPoints,
        );
        if (resolved === null) return null;
        const placed = placedFundedRiskAt(
            rulebook.funded.riskCents / 100,
            resolved,
            account.plan,
        );
        return { contracts: placed.contracts, isCapped: placed.isCapped };
    }

    assemble(results: readonly EngineOptimumRunnerResult[]): Advice {
        const { account, rulebook, snapshotAsOf, today } = this.input;
        const staleness = this.staleness();
        const documented = this.documented();
        const reasons: DifferenceReasonDetail[] = [];

        const placement = this.placedRisk();
        if (placement !== null) {
            if (placement.contracts <= 0) {
                reasons.push({
                    issue: 'the documented flat risk places below one contract at the entered stop',
                    kind: DifferenceReason.EngineInputsRefused,
                });
            } else if (placement.isCapped) {
                reasons.push({
                    contracts: placement.contracts,
                    kind: DifferenceReason.WholeContractPlacement,
                });
            }
        }

        const fundedResult = results.find(
            (result): result is FundedSweepEngineOptimumResult =>
                result.source === AdviceSource.FundedSweepFresh,
        );
        const fromStateResult = results.find(
            (result): result is FundedFromStateEngineOptimumResult =>
                result.source === AdviceSource.FundedSweepFromState,
        );
        const hasFromStateOptimum =
            fromStateResult?.sweep.kind ===
            FundedFromStateOptimumResultKind.Optimum;
        const startBasis = hasFromStateOptimum
            ? StartBasis.FromState
            : StartBasis.Fresh;

        if (fundedResult !== undefined) {
            if (
                fundedResult.sweep.kind === FundedSweepOptimumResultKind.Optimum
            ) {
                const leftOutCount = fundedResult.sweep.optimum.rows.filter(
                    (row) => row.kind === EngineOptimumRowKind.Refused,
                ).length;
                if (!hasFromStateOptimum) {
                    reasons.push({ kind: DifferenceReason.FreshStartApproximation });
                }
                reasons.push({
                    horizonDays: this.input.fundedHorizonDays,
                    kind: DifferenceReason.HorizonCreditOneRequest,
                });
                if (leftOutCount > 0) {
                    reasons.push({
                        kind: DifferenceReason.CandidatesLeftOut,
                        leftOutCount,
                    });
                }
            } else {
                reasons.push({
                    issue: 'no funded candidate could be built for this plan and stop',
                    kind: DifferenceReason.EngineInputsRefused,
                });
            }
        }

        const payoutSizeResult = results.find(
            (result): result is PayoutSizeSweepEngineOptimumResult =>
                result.source === AdviceSource.PayoutSizeSweep,
        );
        if (
            payoutSizeResult?.sweep.kind === PayoutSizeSweepResultKind.Optimum
        ) {
            const { winner } = payoutSizeResult.sweep.optimum;
            const documentedRequest = rulebook.payout.requestCents / 100;
            if (winner.requestSize !== documentedRequest) {
                reasons.push({
                    enginePolicyLabel: `payout-size-sweep-optimum-$${winner.requestSize}`,
                    headlinePolicyLabel: `documented-$${documentedRequest}`,
                    kind: DifferenceReason.PayoutPolicyDiffers,
                });
            }
        }

        const payoutRuleContext = this.payoutRuleContext();
        const advicePayoutAdvice: null | PayoutAdvice =
            payoutRuleContext === null
                ? null
                : payoutAdvice(rulebook, payoutRuleContext);

        return {
            assumptions: this.assumptions(),
            dailyPlanCard: this.dailyPlanCard(),
            differenceReasons: reasons,
            documented,
            headline: documentedRuleLabel(rulebookDeviation(rulebook)),
            optima: results,
            payoutAdvice: advicePayoutAdvice,
            provenance: adviceProvenance({
                computedAt: today,
                firmDataDate: firmDataProvenance(account.plan.id.firm)
                    .verifiedOn,
                objective: SizingObjective.MonthlyNet,
                planRulesFingerprint:
                    this.input.planRulesFingerprint?.current ?? null,
                snapshotDate: snapshotAsOf,
                source: hasFromStateOptimum
                    ? AdviceSource.FundedSweepFromState
                    : AdviceSource.FundedSweepFresh,
                startBasis,
            }),
            requests: this.optimumRequests(),
            stage: SizingStage.Funded,
            staleness,
        };
    }

    caps(): RiskCaps {
        const { account, personalCaps } = this.input;
        return riskCaps(
            dollars(
                account.plan.affordableRisk(
                    account.state,
                    TradingPhase.Funded,
                    NO_COMMISSION,
                ),
            ),
            contractLimitOf(account.contractLimit),
            personalCaps ?? NO_PERSONAL_CAPS,
        );
    }

    optimumRequests(): readonly EngineOptimumRequest[] {
        const {
            account,
            accountPolicy,
            fundedHorizonDays,
            measuredRebuyLag,
            positionSizing,
            rulebook,
            seed,
            trials,
        } = this.input;
        const resolvedPositionSizing = positionSizing
            ? resolvePositionSizing(
                  positionSizing.instrument,
                  positionSizing.stopPoints,
              )
            : null;
        const { policy } = buildEnginePolicy({
            accountPolicy,
            fundedHorizonDays,
            measuredRebuyLag,
            plan: account.plan,
            positionSizing:
                positionSizing === null || positionSizing === undefined
                    ? null
                    : {
                          instrument: positionSizing.instrument,
                          stopPoints: points(positionSizing.stopPoints),
                      },
            rulebook,
        });
        const base: Omit<SimInputs, 'plan'> = {
            fundedHorizonDays,
            instrument: positionSizing?.instrument,
            maxEvalDays: FUNDED_SWEEP_MAX_EVAL_DAYS,
            payoutRequestSize: rulebook.payout.requestCents / 100,
            riskPerTrade: rulebook.funded.riskCents / 100,
            rrRatio: rulebook.strategy.rr,
            seed: seed ?? FUNDED_SWEEP_DEFAULT_SEED,
            stopPoints: positionSizing?.stopPoints,
            tradesPerDay: rulebook.strategy.tradesPerDayMax,
            trials: trials ?? FUNDED_SWEEP_DEFAULT_SIMS,
            winrate: rulebook.strategy.winrate,
        };
        const candidates = {
            flat: DEFAULT_FUNDED_FLAT_CANDIDATES,
            fundedLadder: null,
            positionSizing: resolvedPositionSizing,
            stopRule: fundedStopRuleToDayStopRule(rulebook.funded.stopRule),
        };
        const request: FundedSweepFreshRequest = {
            base,
            candidates,
            policy,
            source: AdviceSource.FundedSweepFresh,
        };
        const requests: EngineOptimumRequest[] = [request];

        const { fundedTracker } = account;
        if (fundedTracker !== null) {
            const hasElapsedHistory =
                (account.state.elapsedDays ?? 0) > 0 ||
                account.state.tradingDays > 0;
            const start: FundedSimStart = {
                phase: TradingPhase.Funded,
                seed: fundedCycleSeedFromTracker(
                    account.plan,
                    account.state,
                    fundedTracker,
                ),
                state: account.state,
            };
            if (hasElapsedHistory) {
                const fromStateRequest: FundedFromStateSweepRequest = {
                    base,
                    candidates,
                    policy,
                    source: AdviceSource.FundedSweepFromState,
                    start,
                };
                requests.push(fromStateRequest);
            }
            const payoutSizeRequest: PayoutSizeSweepRequest = {
                personalOverrideRequest:
                    this.input.personalPayoutOverride ?? null,
                source: AdviceSource.PayoutSizeSweep,
                spec: {
                    enginePolicy: policy,
                    rulebook,
                    run: {
                        maxEvalDays: FUNDED_SWEEP_MAX_EVAL_DAYS,
                        seed: seed ?? FUNDED_SWEEP_DEFAULT_SEED,
                        trials: trials ?? FUNDED_SWEEP_DEFAULT_SIMS,
                    },
                    start: hasElapsedHistory ? start : undefined,
                },
            };
            requests.push(payoutSizeRequest);
        }
        return requests;
    }

    staleness(): AdviceStaleness {
        const { planRulesFingerprint, rulebook, snapshotAsOf, today } =
            this.input;
        return adviceStaleness({
            asOf: snapshotAsOf,
            fundedStaleDays: rulebook.review.fundedStaleDays,
            planRulesFingerprint: planRulesFingerprint ?? null,
            stage: SizingStage.Funded,
            today,
        });
    }

    protected buildContext(): FundedRuleContext {
        const { account, personalCaps, personalDll, positionSizing } =
            this.input;
        return ruleContextAt(account.plan, SizingStage.Funded, account.state, {
            ceiling: fundedConsistencyCeiling(account),
            instrument: positionSizing?.instrument ?? null,
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll ?? null,
        });
    }

    protected payoutEligibleForRiskCheck(): boolean {
        return this.isPayoutRequestDecision(this.payoutRuleContext());
    }
}

export function fundedConsistencyCeiling(
    account: ReconstructedFundedOrEvalAccount,
): Dollars | null {
    const { fundedTracker } = account;
    if (fundedTracker === null) return null;
    const rule = account.plan.fundedConsistencyRule(fundedTracker.payoutsIssued);
    return rule === null
        ? null
        : rule.maxDayProfitBeforeViolation(
              account.state.balance - fundedTracker.lastPayoutBalance,
          );
}
