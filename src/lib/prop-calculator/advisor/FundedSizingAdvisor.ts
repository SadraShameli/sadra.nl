import {
    type Dollars,
    dollars,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    isAtOrBelowWithinCentTolerance,
    placedFundedRiskAt,
    points,
    resolvePositionSizing,
    TradingPhase,
    type VerifiedCumulativeTrigger,
} from '~/lib/prop-calculator/core';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';
import {
    buildFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    DEFAULT_FUNDED_PERCENT_CANDIDATES,
    FundedCandidateBuildKind,
} from '~/lib/prop-calculator/optimize';
import {
    type FundedSimStart,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';
import {
    noiseThreshold,
    noiseVerdict,
    NoiseVerdict,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { type AccountSubstate } from './AccountSubstate';
import { type Advice } from './Advice';
import { adviceProvenance } from './AdviceProvenance';
import { AdviceSource } from './AdviceSource';
import {
    adviceStaleness,
    type AdviceStaleness,
    type PlanRulesFingerprintCheck,
} from './AdviceStaleness';
import {
    aggressiveOptimumChurnReasons,
    documentedPeakRiskOf,
    peakRiskOf,
} from './AggressiveOptimumChurn';
import {
    type Assumption,
    assumptionText,
    cumulativePayoutTriggerAssumption,
    type CumulativePayoutTriggerInputs,
    type LiveTransferHazardAssumption,
} from './Assumption';
import { createDocumentedRule } from './createDocumentedRule';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
    EngineInputsRefusalKind,
} from './DifferenceReason';
import { type DocumentedSizing, NO_COMMISSION } from './DocumentedSizing';
import {
    type EngineOptimum,
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
    type EnginePolicyBuild,
    type MeasuredRebuyLag,
} from './EnginePolicyBuilder';
import { fundedConsistencyCeiling } from './FundedConsistencyCeiling';
import {
    fundedCycleSeedFromTracker,
    type FundedFromStateOptimum,
    FundedFromStateOptimumResultKind,
    type FundedFromStateSweepRequest,
} from './FundedFromStateSweep';
import {
    areLiveTriggersEnginePriced,
    type LiveTriggerLimits,
    liveTriggerLimitsFor,
    liveTriggerRuleCaps,
    payoutAdvice,
    type PayoutAdvice,
} from './PayoutAdvice';
import { PayoutBlockReasonKind } from './PayoutBlockReason';
import { PayoutRequestDecisionKind } from './PayoutRequestDecision';
import {
    type FundedPayoutRuleContext,
    fundedPayoutRuleContextOf,
} from './PayoutRequestRule';
import {
    type PayoutSizeSweepOptimum,
    type PayoutSizeSweepRequest,
    PayoutSizeSweepResultKind,
} from './PayoutSizeSweep';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import { type SizingPlacement } from './PlaceableMinimum';
import {
    cappedRisk,
    documentedFundedRisk,
    documentedLiveTransferHazard,
    type EnginePolicy,
    enginePolicySchema,
    resolveDocumentedPayoutRequestSize,
    verifiedCumulativeTriggerOf,
} from './policy';
import {
    pendingPayoutCountsOf,
    type ReconstructedFundedOrEvalAccount,
} from './ReconstructedAccount';
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
    readonly substate: AccountSubstate.Suspended | null;
    readonly today: string;
    readonly trials?: number;
}

type SweepOptimum = EngineOptimum | FundedFromStateOptimum;

const FUNDED_SWEEP_DEFAULT_SIMS = 4000;
const FUNDED_SWEEP_DEFAULT_SEED = 42;
const FUNDED_SWEEP_MAX_EVAL_DAYS = 150;
const DOCUMENTED_RISK_CENT_TOLERANCE = 0.005;

export class FundedSizingAdvisor extends SizingAdvisor<FundedRuleContext> {
    private readonly input: FundedSizingAdvisorInput;

    constructor(input: FundedSizingAdvisorInput) {
        super(
            SizingStage.Funded,
            input.rulebook,
            createDocumentedRule(SizingStage.Funded, input.rulebook),
            input.substate,
        );
        this.input = input;
    }

    private assumptions(
        results: readonly EngineOptimumRunnerResult[],
        fundedResult: FundedSweepEngineOptimumResult | undefined,
        fromStateResult: FundedFromStateEngineOptimumResult | undefined,
    ): readonly Assumption[] {
        const { assumptions } = this.input.account;
        const verifiedTrigger = this.verifiedCumulativeTrigger();
        const isTriggerPriced =
            verifiedTrigger !== null &&
            (freshOptimumOf(fundedResult) !== null ||
                fromStateOptimumOf(fromStateResult) !== null ||
                payoutSizeOptimumOf(results) !== null);
        const { account, accountPolicy } = this.input;
        const isEveryTriggerChecked =
            areLiveTriggersEnginePriced(accountPolicy, account.plan) &&
            (verifiedTrigger === null || isTriggerPriced);
        const accountAssumptions = isEveryTriggerChecked
            ? assumptions
            : this.withLiveTriggersNotChecked(assumptions);
        const priced = sweepLiveTransferAssumptions(
            fundedResult,
            fromStateResult,
        );
        return distinctAssumptions([
            ...accountAssumptions,
            ...this.enginePolicyBuild().assumptions,
            ...priced,
            ...(isTriggerPriced
                ? [
                      cumulativePayoutTriggerAssumption(
                          verifiedTrigger,
                          this.triggerInputs(),
                      ),
                  ]
                : []),
        ]);
    }

    private triggerInputs(): CumulativePayoutTriggerInputs {
        const { account, positionSizing } = this.input;
        return {
            instrument: positionSizing?.instrument,
            plan: account.plan,
            stopPoints: positionSizing?.stopPoints,
        };
    }

    private verifiedCumulativeTrigger(): null | VerifiedCumulativeTrigger {
        const { account, accountPolicy } = this.input;
        return verifiedCumulativeTriggerOf(accountPolicy, account.plan);
    }

    private liveTriggerLimits(): LiveTriggerLimits {
        const { account, accountPolicy, paidPayoutsSinceLastLiveAccount } =
            this.input;
        return liveTriggerLimitsFor(
            accountPolicy,
            account.plan,
            paidPayoutsSinceLastLiveAccount ?? null,
        );
    }

    private payoutRuleContext(): FundedPayoutRuleContext | null {
        const { account, personalRetainedCushion } = this.input;
        if (account.fundedTracker === null) return null;
        return fundedPayoutRuleContextOf({
            ...pendingPayoutCountsOf(account),
            liveTrigger: this.liveTriggerLimits(),
            pendingPayouts: account.pendingPayouts ?? 0,
            personalRequestOverride: this.appliedPayoutOverride(),
            personalRetainedCushion: personalRetainedCushion ?? null,
            plan: account.plan,
            state: account.state,
            tracker: account.fundedTracker,
        });
    }

    private appliedPayoutOverride(): Dollars | null {
        const { payoutRequestOverride } = this.enginePolicy();
        return payoutRequestOverride === null
            ? null
            : dollars(payoutRequestOverride);
    }

    private candidateLists(): FundedSweepFreshRequest['candidates'] {
        const { personalCaps, positionSizing, rulebook } = this.input;
        return {
            flat: personalBoundedFlats(
                DEFAULT_FUNDED_FLAT_CANDIDATES,
                personalCaps?.maxRiskPerTrade ?? null,
            ),
            fundedLadder: null,
            positionSizing: positionSizing
                ? resolvePositionSizing(
                      positionSizing.instrument,
                      positionSizing.stopPoints,
                  )
                : null,
            stopRule: fundedStopRuleToDayStopRule(rulebook.funded.stopRule),
        };
    }

    private churnReasons(
        documented: DocumentedSizing | null,
        fundedResult: FundedSweepEngineOptimumResult | undefined,
        fromStateResult: FundedFromStateEngineOptimumResult | undefined,
    ): readonly DifferenceReasonDetail[] {
        const { account, accountPolicy } = this.input;
        const optimum =
            fromStateOptimumOf(fromStateResult) ?? freshOptimumOf(fundedResult);
        return aggressiveOptimumChurnReasons({
            accountPolicy,
            documentedPeakRisk: documentedPeakRiskOf(documented),
            optimumPeakRisk: this.optimumPeakRisk(optimum?.label ?? null),
            plan: account.plan,
        });
    }

    private enginePolicy(): EnginePolicy {
        const { policy } = this.enginePolicyBuild();
        const { personalPayoutOverride } = this.input;
        if (
            personalPayoutOverride === null ||
            personalPayoutOverride === undefined
        ) {
            return policy;
        }
        const applied = enginePolicySchema.safeParse({
            ...policy,
            payoutRequestOverride: personalPayoutOverride,
        });
        return applied.success ? applied.data : policy;
    }

    private enginePolicyBuild(): EnginePolicyBuild {
        const {
            account,
            accountPolicy,
            fundedHorizonDays,
            measuredRebuyLag,
            personalCaps,
            personalDll,
            personalRetainedCushion,
            positionSizing,
            rulebook,
        } = this.input;
        return buildEnginePolicy({
            accountPolicy,
            fundedHorizonDays,
            measuredRebuyLag,
            personalCaps,
            personalDll,
            personalRetainedCushion,
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
    }

    private optimumPeakRisk(label: null | string): null | number {
        if (label === null) return null;
        const { account } = this.input;
        const build = buildFundedCandidates({
            ...this.candidateLists(),
            plan: account.plan,
        });
        if (build.kind !== FundedCandidateBuildKind.Built) return null;
        const overrides = build.candidates.find(
            (candidate) => candidate.label === label,
        )?.overrides;
        if (overrides === undefined) return null;
        const { fundedCushionPercent, fundedDayPolicy, fundedRiskPerTrade } =
            overrides;
        if (fundedRiskPerTrade !== undefined) return fundedRiskPerTrade;
        return fundedCushionPercent === undefined
            ? peakRiskOf(fundedDayPolicy?.ladder ?? [])
            : cappedRisk(
                  fundedCushionPercent * account.cushion,
                  this.input.personalCaps?.maxRiskPerTrade ?? null,
              );
    }

    private personalCapReasons(): readonly DifferenceReasonDetail[] {
        const { account, personalCaps, positionSizing } = this.input;
        const cap = personalCaps?.maxRiskPerTrade ?? null;
        if (cap === null) return [];
        const isFlatRemoved = DEFAULT_FUNDED_FLAT_CANDIDATES.some(
            (flat) => !isAtOrBelowWithinCentTolerance(flat, cap),
        );
        const isPercentCapped =
            positionSizing !== null &&
            positionSizing !== undefined &&
            DEFAULT_FUNDED_PERCENT_CANDIDATES.some(
                (percent) =>
                    !isAtOrBelowWithinCentTolerance(
                        (percent / 100) * account.cushion,
                        cap,
                    ),
            );
        return isFlatRemoved || isPercentCapped
            ? [{ cap, kind: DifferenceReason.PersonalCap }]
            : [];
    }

    private payoutOverrideReasons(
        policy: EnginePolicy,
    ): readonly DifferenceReasonDetail[] {
        const { personalPayoutOverride } = this.input;
        const isRejected =
            personalPayoutOverride !== null &&
            personalPayoutOverride !== undefined &&
            policy.payoutRequestOverride === null;
        return isRejected
            ? [
                  {
                      kind: DifferenceReason.EngineInputsRefused,
                      refusal: EngineInputsRefusalKind.PayoutOverrideRejected,
                  },
              ]
            : [];
    }

    private payoutPolicyReasons(
        results: readonly EngineOptimumRunnerResult[],
        policy: EnginePolicy,
    ): readonly DifferenceReasonDetail[] {
        const { account, rulebook } = this.input;
        const winner = payoutSizeOptimumOf(results)?.winner;
        if (winner === undefined) return [];
        const headlineRequest = resolveDocumentedPayoutRequestSize(
            account.plan,
            policy,
            rulebook.payout,
        );
        return winner.requestSize === headlineRequest
            ? []
            : [
                  {
                      engineRequest: dollars(winner.requestSize),
                      headlineRequest: dollars(headlineRequest),
                      kind: DifferenceReason.PayoutPolicyDiffers,
                  },
              ];
    }

    private documentedSweepRowLabel(policy: EnginePolicy): null | string {
        const { account, rulebook } = this.input;
        const documentedRisk = documentedFundedRisk(rulebook, policy);
        const build = buildFundedCandidates({
            ...this.candidateLists(),
            plan: account.plan,
        });
        return build.kind === FundedCandidateBuildKind.Built
            ? (build.candidates.find(
                  (candidate) =>
                      candidate.overrides.fundedRiskPerTrade !== undefined &&
                      Math.abs(
                          candidate.overrides.fundedRiskPerTrade -
                              documentedRisk,
                      ) < DOCUMENTED_RISK_CENT_TOLERANCE,
              )?.label ?? null)
            : null;
    }

    private withinNoiseReasons(
        fundedResult: FundedSweepEngineOptimumResult | undefined,
        fromStateResult: FundedFromStateEngineOptimumResult | undefined,
        policy: EnginePolicy,
    ): readonly DifferenceReasonDetail[] {
        const optimum =
            fromStateOptimumOf(fromStateResult) ?? freshOptimumOf(fundedResult);
        const documentedLabel = this.documentedSweepRowLabel(policy);
        if (
            optimum === null ||
            documentedLabel === null ||
            optimum.label === documentedLabel
        ) {
            return [];
        }
        const measured = sweepMeasurementsOf(optimum, documentedLabel);
        if (measured === null) return [];
        const { documented, winner } = measured;
        if (
            ![
                documented.value,
                documented.standardError,
                winner.value,
                winner.standardError,
            ].every(Number.isFinite) ||
            noiseVerdict(documented, winner, { sharedSeed: false }) !==
                NoiseVerdict.WithinNoise
        ) {
            return [];
        }
        return [
            {
                gap: dollars(Math.abs(documented.value - winner.value)),
                kind: DifferenceReason.WithinNoise,
                threshold: dollars(
                    noiseThreshold(documented, winner, { sharedSeed: false }) ??
                        0,
                ),
            },
        ];
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
            documentedFundedRisk(rulebook, this.enginePolicy()),
            resolved,
            account.plan,
        );
        return { contracts: placed.contracts, isCapped: placed.isCapped };
    }

    private sweepReasons(
        fundedResult: FundedSweepEngineOptimumResult | undefined,
        fromStateResult: FundedFromStateEngineOptimumResult | undefined,
    ): readonly DifferenceReasonDetail[] {
        const fromStateOptimum = fromStateOptimumOf(fromStateResult);
        const freshOptimum = freshOptimumOf(fundedResult);
        const rows = (fromStateOptimum ?? freshOptimum)?.rows;
        if (rows === undefined) {
            const isRefused =
                fundedResult?.sweep.kind ===
                    FundedSweepOptimumResultKind.NoCandidates ||
                (fundedResult === undefined &&
                    fromStateResult?.sweep.kind ===
                        FundedFromStateOptimumResultKind.NoCandidates);
            return isRefused
                ? [
                      {
                          kind: DifferenceReason.EngineInputsRefused,
                          refusal: EngineInputsRefusalKind.NoCandidates,
                      },
                  ]
                : [];
        }
        const leftOutCount = rows.filter(
            (row) => row.kind === EngineOptimumRowKind.Refused,
        ).length;
        return [
            ...(fromStateOptimum === null
                ? [{ kind: DifferenceReason.FreshStartApproximation } as const]
                : []),
            {
                horizonDays: this.input.fundedHorizonDays,
                kind: DifferenceReason.HorizonCreditOneRequest,
            },
            ...(leftOutCount > 0
                ? [
                      {
                          kind: DifferenceReason.CandidatesLeftOut,
                          leftOutCount,
                      } as const,
                  ]
                : []),
        ];
    }

    protected override assembleAdvice(
        results: readonly EngineOptimumRunnerResult[],
    ): Advice {
        const { account, rulebook, snapshotAsOf, today } = this.input;
        const staleness = this.staleness();
        const documented = this.documented();
        const reasons: DifferenceReasonDetail[] = [];

        const placement = this.placedRisk();
        if (placement !== null) {
            if (placement.contracts <= 0) {
                reasons.push({
                    kind: DifferenceReason.EngineInputsRefused,
                    refusal: EngineInputsRefusalKind.FlatBelowOneContract,
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

        const policy = this.enginePolicy();
        reasons.push(
            ...this.sweepReasons(fundedResult, fromStateResult),
            ...this.withinNoiseReasons(fundedResult, fromStateResult, policy),
            ...this.personalCapReasons(),
            ...this.churnReasons(documented, fundedResult, fromStateResult),
            ...this.payoutOverrideReasons(policy),
            ...this.payoutPolicyReasons(results, policy),
        );

        const payoutRuleContext = this.payoutRuleContext();
        const personalOverrideWarning =
            payoutSizeOptimumOf(results)?.personalOverride?.warning ?? null;
        const advicePayoutAdvice: null | PayoutAdvice =
            payoutRuleContext === null
                ? null
                : {
                      ...payoutAdvice(
                          rulebook,
                          payoutRuleContext,
                          this.liveTriggerLimits().coverage,
                      ),
                      ...(personalOverrideWarning !== null && {
                          personalOverrideWarning,
                      }),
                  };
        if (
            advicePayoutAdvice?.documented.kind ===
                PayoutRequestDecisionKind.NotEligible &&
            advicePayoutAdvice.documented.reason.kind ===
                PayoutBlockReasonKind.WouldTriggerLive
        ) {
            reasons.push({
                kind: DifferenceReason.WouldTriggerLive,
                trigger: advicePayoutAdvice.documented.reason.trigger,
            });
        }

        return {
            assumptions: this.assumptions(
                results,
                fundedResult,
                fromStateResult,
            ),
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

    protected override sizedCaps(): RiskCaps {
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

    protected override engineRequests(): readonly EngineOptimumRequest[] {
        const {
            account,
            fundedHorizonDays,
            positionSizing,
            rulebook,
            seed,
            trials,
        } = this.input;
        const policy = this.enginePolicy();
        const liveTransferHazard = documentedLiveTransferHazard(
            rulebook,
            account.plan.id.firm,
        );
        const verifiedCumulativePayoutTrigger =
            this.verifiedCumulativeTrigger()?.amount ?? null;
        const base: Omit<SimInputs, 'plan'> = {
            fundedHorizonDays,
            instrument: positionSizing?.instrument,
            ...(liveTransferHazard !== undefined && { liveTransferHazard }),
            maxEvalDays: FUNDED_SWEEP_MAX_EVAL_DAYS,
            payoutRequestSize: resolveDocumentedPayoutRequestSize(
                account.plan,
                policy,
                rulebook.payout,
            ),
            riskPerTrade: documentedFundedRisk(rulebook, policy),
            rrRatio: rulebook.strategy.rr,
            seed: seed ?? FUNDED_SWEEP_DEFAULT_SEED,
            stopPoints: positionSizing?.stopPoints,
            tradesPerDay: rulebook.strategy.tradesPerDayMax,
            trials: trials ?? FUNDED_SWEEP_DEFAULT_SIMS,
            ...(verifiedCumulativePayoutTrigger !== null && {
                verifiedCumulativePayoutTrigger,
            }),
            winrate: rulebook.strategy.winrate,
        };
        const candidates = this.candidateLists();
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
                personalOverrideRequest: this.appliedPayoutOverride(),
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
            ...liveTriggerRuleCaps(
                fundedConsistencyCeiling(account),
                this.liveTriggerLimits(),
                positionSizing,
            ),
            instrument: positionSizing?.instrument ?? null,
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll ?? null,
        });
    }

    protected override enteredPlacement(): null | SizingPlacement {
        return this.input.positionSizing ?? null;
    }

    protected payoutEligibleForRiskCheck(): boolean {
        return this.isPayoutRequestDecision(this.payoutRuleContext());
    }
}

function distinctAssumptions(
    assumptions: readonly Assumption[],
): readonly Assumption[] {
    const seen = new Set<string>();
    return assumptions.filter((assumption) => {
        const key = assumptionText(assumption);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function freshOptimumOf(
    result: FundedSweepEngineOptimumResult | undefined,
): null | SweepOptimum {
    return result?.sweep.kind === FundedSweepOptimumResultKind.Optimum
        ? result.sweep.optimum
        : null;
}

function fromStateOptimumOf(
    result: FundedFromStateEngineOptimumResult | undefined,
): null | SweepOptimum {
    return result?.sweep.kind === FundedFromStateOptimumResultKind.Optimum
        ? result.sweep.optimum
        : null;
}

function payoutSizeOptimumOf(
    results: readonly EngineOptimumRunnerResult[],
): null | PayoutSizeSweepOptimum {
    const found = results.find(
        (result): result is PayoutSizeSweepEngineOptimumResult =>
            result.source === AdviceSource.PayoutSizeSweep,
    );
    return found?.sweep.kind === PayoutSizeSweepResultKind.Optimum
        ? found.sweep.optimum
        : null;
}

function personalBoundedFlats(
    flats: readonly number[],
    cap: Dollars | null,
): readonly number[] {
    if (cap === null) return flats;
    const within = flats.filter((flat) =>
        isAtOrBelowWithinCentTolerance(flat, cap),
    );
    const clamped = within.map((flat) => cappedRisk(flat, cap));
    return [
        ...new Set(
            within.length === flats.length ? clamped : [...clamped, cap],
        ),
    ].toSorted((a, b) => a - b);
}

function placedRowLabelled<
    TRow extends {
        readonly kind: EngineOptimumRowKind;
        readonly label: string;
    },
>(
    rows: readonly TRow[],
    label: string,
): Extract<TRow, { readonly kind: EngineOptimumRowKind.Placed }> | undefined {
    return rows.find(
        (
            row,
        ): row is Extract<
            TRow,
            { readonly kind: EngineOptimumRowKind.Placed }
        > => row.kind === EngineOptimumRowKind.Placed && row.label === label,
    );
}

function sweepLiveTransferAssumptions(
    fundedResult: FundedSweepEngineOptimumResult | undefined,
    fromStateResult: FundedFromStateEngineOptimumResult | undefined,
): readonly LiveTransferHazardAssumption[] {
    const candidates = [
        fundedResult?.liveTransfer,
        fromStateResult?.sweep.kind === FundedFromStateOptimumResultKind.Optimum
            ? fromStateResult.sweep.optimum.liveTransfer
            : undefined,
    ];
    const seen = new Set<string>();
    const found: LiveTransferHazardAssumption[] = [];
    for (const candidate of candidates) {
        if (candidate === undefined) continue;
        const text = assumptionText(candidate);
        if (seen.has(text)) continue;
        seen.add(text);
        found.push(candidate);
    }
    return found;
}

function sweepMeasurementsOf(
    optimum: SweepOptimum,
    documentedLabel: string,
): null | {
    readonly documented: UncertainValue;
    readonly winner: UncertainValue;
} {
    if ('fromStateExpectedCash' in optimum) {
        const row = placedRowLabelled(optimum.rows, documentedLabel);
        if (row === undefined) return null;
        return {
            documented: {
                standardError:
                    row.out.estimates.fromStateExpectedCash.standardError,
                value: row.out.fromStateExpectedCash,
            },
            winner: {
                standardError:
                    optimum.fromStateExpectedCashStandardError ?? NaN,
                value: optimum.fromStateExpectedCash,
            },
        };
    }
    const row = placedRowLabelled(optimum.rows, documentedLabel);
    if (row === undefined) return null;
    return {
        documented: {
            standardError: row.out.estimates.expectedMonthlyNet.standardError,
            value: row.out.expectedMonthlyNet,
        },
        winner: {
            standardError: optimum.expectedMonthlyNetStandardError ?? NaN,
            value: optimum.expectedMonthlyNet,
        },
    };
}
