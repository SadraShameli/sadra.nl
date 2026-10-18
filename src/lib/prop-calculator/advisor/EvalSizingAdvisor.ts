import {
    type AccountState,
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    defaultLadderGridMax,
    dollars,
    type Dollars,
    type FirmAccountPolicy,
    GRID_COUNT_TOLERANCE,
    type InstrumentSymbol,
    type LadderGridConfig,
    ladderGridSize,
    type LadderScore,
    type LadderSearchResult,
    MAX_LADDER_GRID_SIZE,
    points,
    resolvePositionSizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';
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
    AssumptionBias,
    ladderStepWidenedAssumption,
} from './Assumption';
import { createDocumentedRule } from './createDocumentedRule';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from './DifferenceReason';
import { NO_COMMISSION } from './DocumentedSizing';
import {
    type EngineLadderScoreConfig,
    type EngineOptimumRequest,
    type LadderSearchRequest,
} from './EngineOptimumRequest';
import {
    type EngineOptimumRunnerResult,
    LadderEngineOptimumResultKind,
    type LadderScoredEngineOptimumResult,
} from './EngineOptimumRunner';
import {
    buildEnginePolicy,
    type MeasuredRebuyLag,
} from './EnginePolicyBuilder';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import { advisorPlaceableMinimum } from './PlaceableMinimum';
import { type EnginePolicy, personalDayLimitsOf } from './policy';
import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';
import { contractLimitOf, riskCaps, type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { documentedRuleLabel, rulebookDeviation } from './RulebookDeviation';
import { type EvalRuleContext, ruleContextAt } from './RuleContext';
import { DEFAULT_FUNDED_HORIZON_DAYS, SizingAdvisor } from './SizingAdvisor';
import { SpeedObjective } from './SizingObjective';
import { SizingStage } from './SizingStage';
import { StartBasis } from './StartBasis';

const EVAL_LADDER_GRID_LO = 100;
const EVAL_LADDER_GRID_STEP = 100;
const EVAL_LADDER_GRID_SLOTS = 4;
const EVAL_LADDER_MAX_GRID_SIZE = Math.min(2000, MAX_LADDER_GRID_SIZE);
const EVAL_LADDER_DEFAULT_SIMS = 4000;
const EVAL_LADDER_DEFAULT_SEED = 42;

export interface EvalSizingAdvisorInput {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly accountPolicy?: FirmAccountPolicy;
    readonly fundedHorizonDays?: number;
    readonly maxEvalDays: number;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
    readonly planRulesFingerprint?: null | PlanRulesFingerprintCheck;
    readonly positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    };
    readonly rulebook: RulebookParameters;
    readonly seed?: number;
    readonly sims?: number;
    readonly snapshotAsOf: string;
    readonly substate: AccountSubstate.Suspended | null;
    readonly today: string;
}

export class EvalSizingAdvisor extends SizingAdvisor<EvalRuleContext> {
    private readonly input: EvalSizingAdvisorInput;

    constructor(input: EvalSizingAdvisorInput) {
        super(
            SizingStage.Eval,
            input.rulebook,
            createDocumentedRule(SizingStage.Eval, input.rulebook),
            input.substate,
        );
        this.input = input;
    }

    private assumptions(): readonly Assumption[] {
        const { account } = this.input;
        const { step } = this.ladderGrid();
        return this.withLiveTriggersNotChecked(
            step > EVAL_LADDER_GRID_STEP
                ? [
                      ...account.assumptions,
                      ladderStepWidenedAssumption(step, AssumptionBias.Neutral),
                  ]
                : account.assumptions,
        );
    }

    private enginePolicy(): EnginePolicy {
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
            fundedHorizonDays: fundedHorizonDays ?? DEFAULT_FUNDED_HORIZON_DAYS,
            measuredRebuyLag,
            personalCaps,
            personalDll,
            personalRetainedCushion: personalRetainedCushion ?? undefined,
            plan: account.plan,
            positionSizing:
                positionSizing === null || positionSizing === undefined
                    ? null
                    : {
                          instrument: positionSizing.instrument,
                          stopPoints: points(positionSizing.stopPoints),
                      },
            rulebook,
        }).policy;
    }

    private differenceReasons(
        results: readonly EngineOptimumRunnerResult[],
    ): readonly DifferenceReasonDetail[] {
        const withinNoise = this.withinNoiseReason(results);
        const { account, accountPolicy } = this.input;
        const { resolvedDailyLossLimit } = account;
        const personalMaxRisk =
            this.input.personalCaps?.maxRiskPerTrade ?? null;
        const slots = this.ladderSlots();
        const churn = aggressiveOptimumChurnReasons({
            accountPolicy,
            documentedPeakRisk: documentedPeakRiskOf(this.documented()),
            optimumPeakRisk: peakRiskOf(
                results.find(isScoredLadderResult)?.ladder.bySpeed[0]?.ladder ??
                    [],
            ),
            plan: account.plan,
        });
        return [
            { kind: DifferenceReason.ObjectiveSpeedVsMonthlyNet },
            ...(resolvedDailyLossLimit === null
                ? []
                : [
                      {
                          dailyLossLimit: dollars(resolvedDailyLossLimit),
                          kind: DifferenceReason.DailyLossCap,
                      } as const,
                  ]),
            ...(personalMaxRisk !== null &&
            isLadderGridNarrowed(account.cushion, personalMaxRisk, slots)
                ? [
                      {
                          cap: personalMaxRisk,
                          kind: DifferenceReason.PersonalCap,
                      } as const,
                  ]
                : []),
            ...(withinNoise === null ? [] : [withinNoise]),
            ...churn,
        ];
    }

    private documentedLadder(): null | readonly number[] {
        const documented = this.documented();
        return documented === null || documented.rungs.length === 0
            ? null
            : documented.rungs.map((rung) => rung.risk);
    }

    private ladderGrid(): LadderGridConfig {
        const { account, personalCaps } = this.input;
        return evalLadderGrid(
            account.cushion,
            personalCaps?.maxRiskPerTrade ?? null,
            this.ladderSlots(),
        );
    }

    private ladderRequest(): LadderSearchRequest {
        const documentedLadder = this.documentedLadder();
        const {
            account,
            maxEvalDays,
            personalCaps,
            personalDll,
            positionSizing,
            rulebook,
            seed,
        } = this.input;
        const dayLimits = personalDayLimitsOf(personalCaps, personalDll);
        const elapsedDays = elapsedDaysOf(account);
        const isFromState = elapsedDays > 0;
        const score: EngineLadderScoreConfig = {
            commission: NO_COMMISSION,
            cushion: account.cushion,
            maxDays: maxEvalDays,
            positionSizing: positionSizing
                ? resolvePositionSizing(
                      positionSizing.instrument,
                      positionSizing.stopPoints,
                  )
                : null,
            rrRatio: rulebook.strategy.rr,
            rungSizing: RungSizing.CapToCushion,
            seedOffset: 0,
            sims: this.scoredSims(),
            stopRule: { kind: DayStopRuleKind.DayGreen },
            winrate: rulebook.strategy.winrate,
            ...(isFromState && {
                startState: account.state,
                subscriptionElapsedDays: elapsedDays,
            }),
        };
        return {
            ...(dayLimits !== null && { dayLimits }),
            ...(documentedLadder !== null && { documentedLadder }),
            grid: this.ladderGrid(),
            maxGridSize: EVAL_LADDER_MAX_GRID_SIZE,
            policy: this.enginePolicy(),
            score,
            seed: seed ?? EVAL_LADDER_DEFAULT_SEED,
            source: isFromState
                ? AdviceSource.LadderSearchFromState
                : AdviceSource.LadderSearchFresh,
        };
    }

    private ladderSlots(): number {
        const maxTrades = this.input.personalCaps?.maxTradesPerDay ?? null;
        return maxTrades === null
            ? EVAL_LADDER_GRID_SLOTS
            : Math.min(EVAL_LADDER_GRID_SLOTS, maxTrades);
    }

    private scoredSims(): number {
        return this.input.sims ?? EVAL_LADDER_DEFAULT_SIMS;
    }

    private withinNoiseReason(
        results: readonly EngineOptimumRunnerResult[],
    ): DifferenceReasonDetail | null {
        const scored = results.find(isScoredLadderResult);
        if (scored === undefined) return null;
        const optimum = scored.ladder.bySpeed[0];
        if (isEngineLadderNeverFunded(scored.ladder, optimum)) {
            return {
                kind: DifferenceReason.EngineLadderNeverFunded,
                sims: this.scoredSims(),
            };
        }
        const { documentedScore } = scored;
        if (documentedScore === undefined) {
            return this.documentedLadder() === null
                ? null
                : {
                      kind: DifferenceReason.DocumentedLadderNotScored,
                      sims: this.scoredSims(),
                  };
        }
        if (!isFundedScore(documentedScore)) {
            return {
                kind: DifferenceReason.DocumentedLadderNeverFunded,
                sims: this.scoredSims(),
            };
        }
        if (optimum === undefined) return null;
        const cost = measuredPair(
            documentedScore.costPerFunded,
            documentedScore.costPerFundedStandardError,
            optimum.costPerFunded,
            optimum.costPerFundedStandardError,
        );
        const days = measuredPair(
            documentedScore.expectedDaysToFunded,
            documentedScore.expectedDaysToFundedStandardError,
            optimum.expectedDaysToFunded,
            optimum.expectedDaysToFundedStandardError,
        );
        if (cost === null || days === null) return null;
        const isWithinNoise = [cost, days].every(
            ([documentedValue, optimumValue]) =>
                noiseVerdict(documentedValue, optimumValue, {
                    sharedSeed: false,
                }) === NoiseVerdict.WithinNoise,
        );
        if (!isWithinNoise) return null;
        const [documentedCost, optimumCost] = cost;
        return {
            gap: dollars(Math.abs(documentedCost.value - optimumCost.value)),
            kind: DifferenceReason.WithinNoise,
            threshold: dollars(
                noiseThreshold(documentedCost, optimumCost, {
                    sharedSeed: false,
                }) ?? 0,
            ),
        };
    }

    protected override assembleAdvice(
        results: readonly EngineOptimumRunnerResult[],
    ): Advice {
        const { account, snapshotAsOf, today } = this.input;
        const staleness = this.staleness();
        const documented = this.documented();
        const startBasis =
            elapsedDaysOf(account) > 0
                ? StartBasis.FromState
                : StartBasis.Fresh;
        return {
            assumptions: this.assumptions(),
            dailyPlanCard: this.dailyPlanCard(),
            differenceReasons: this.differenceReasons(results),
            documented,
            headline: documentedRuleLabel(rulebookDeviation(this.rulebook)),
            optima: results,
            payoutAdvice: null,
            provenance: adviceProvenance({
                computedAt: today,
                firmDataDate: firmDataProvenance(account.plan.id.firm)
                    .verifiedOn,
                objective: SpeedObjective.SpeedToFunded,
                planRulesFingerprint:
                    this.input.planRulesFingerprint?.current ?? null,
                snapshotDate: snapshotAsOf,
                source:
                    startBasis === StartBasis.Fresh
                        ? AdviceSource.LadderSearchFresh
                        : AdviceSource.LadderSearchFromState,
                startBasis,
            }),
            requests: this.optimumRequests(),
            stage: SizingStage.Eval,
            staleness,
        };
    }

    protected override sizedCaps(): RiskCaps {
        const { account, personalCaps } = this.input;
        return riskCaps(
            dollars(
                account.plan.affordableRisk(
                    account.state,
                    TradingPhase.Eval,
                    NO_COMMISSION,
                ),
            ),
            contractLimitOf(account.contractLimit),
            personalCaps ?? NO_PERSONAL_CAPS,
        );
    }

    protected override engineRequests(): readonly EngineOptimumRequest[] {
        return [this.ladderRequest()];
    }

    staleness(): AdviceStaleness {
        const {
            planRulesFingerprint = null,
            rulebook,
            snapshotAsOf,
            today,
        } = this.input;
        return adviceStaleness({
            asOf: snapshotAsOf,
            fundedStaleDays: rulebook.review.fundedStaleDays,
            planRulesFingerprint: planRulesFingerprint,
            stage: SizingStage.Eval,
            today,
        });
    }

    protected buildContext(): EvalRuleContext {
        const {
            account,
            personalCaps,
            personalDll = null,
            positionSizing,
        } = this.input;
        return ruleContextAt(account.plan, SizingStage.Eval, account.state, {
            ceiling: null,
            instrument: positionSizing?.instrument ?? null,
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll,
            placeableMinimum: advisorPlaceableMinimum(positionSizing),
        });
    }
}

function defaultEvalLadderGrid(
    cushion: number,
    slots: number,
): LadderGridConfig {
    const span =
        Math.max(EVAL_LADDER_GRID_LO, defaultLadderGridMax(cushion)) -
        EVAL_LADDER_GRID_LO;
    const baseRungCount = Math.floor(span / EVAL_LADDER_GRID_STEP) + 1;
    let grid = gridWithRungCount(baseRungCount, EVAL_LADDER_GRID_STEP, slots);
    for (
        let rungCount = baseRungCount - 1;
        ladderGridSize(grid) > EVAL_LADDER_MAX_GRID_SIZE && rungCount >= 2;
        rungCount--
    ) {
        grid = gridWithRungCount(
            rungCount,
            Math.ceil(span / (rungCount - 1)),
            slots,
        );
    }
    return grid;
}

function elapsedDaysOf(account: { readonly state: AccountState }): number {
    return account.state.elapsedDays ?? 0;
}

function evalLadderGrid(
    cushion: number,
    maxRiskPerTrade: Dollars | null,
    slots: number,
): LadderGridConfig {
    const grid = defaultEvalLadderGrid(cushion, slots);
    return maxRiskPerTrade === null || maxRiskPerTrade >= grid.max
        ? grid
        : gridWithin(grid, maxRiskPerTrade);
}

function gridWithin(grid: LadderGridConfig, cap: number): LadderGridConfig {
    if (cap < grid.lo) return { ...grid, lo: cap, max: cap };
    const span = cap - grid.lo;
    const minimumLevels =
        Math.ceil(span / grid.step - GRID_COUNT_TOLERANCE) + 1;
    if (minimumLevels <= 1) return { ...grid, max: cap };
    const defaultLevels = Math.round((grid.max - grid.lo) / grid.step) + 1;
    const levels = wholeCentLevels(span, minimumLevels, defaultLevels);
    if (levels !== null)
        return { ...grid, max: cap, step: span / (levels - 1) };
    const stepCents = Math.max(
        1,
        Math.floor(Math.round(span * CENTS_PER_DOLLAR) / (minimumLevels - 1)),
    );
    return {
        ...grid,
        max: grid.lo + ((minimumLevels - 1) * stepCents) / CENTS_PER_DOLLAR,
        step: stepCents / CENTS_PER_DOLLAR,
    };
}

function gridWithRungCount(
    rungCount: number,
    step: number,
    slots: number,
): LadderGridConfig {
    return {
        lo: EVAL_LADDER_GRID_LO,
        max: EVAL_LADDER_GRID_LO + (rungCount - 1) * step,
        slots,
        step,
    };
}

function isEngineLadderNeverFunded(
    ladder: LadderSearchResult,
    optimum: LadderScore | undefined,
): boolean {
    return optimum === undefined
        ? ladder.unscorableCount > 0
        : !isFundedScore(optimum);
}

function isFundedScore(score: LadderScore): boolean {
    return (
        Number.isFinite(score.costPerFunded) &&
        Number.isFinite(score.expectedDaysToFunded)
    );
}

function isLadderGridNarrowed(
    cushion: number,
    cap: number,
    slots: number,
): boolean {
    return cap < defaultEvalLadderGrid(cushion, slots).max;
}

function isScoredLadderResult(
    result: EngineOptimumRunnerResult,
): result is LadderScoredEngineOptimumResult {
    return (
        (result.source === AdviceSource.LadderSearchFresh ||
            result.source === AdviceSource.LadderSearchFromState) &&
        result.kind === LadderEngineOptimumResultKind.Scored
    );
}

function measuredPair(
    documentedValue: number,
    documentedStandardError: number,
    optimumValue: number,
    optimumStandardError: number,
): null | readonly [UncertainValue, UncertainValue] {
    const measurements = [
        documentedValue,
        documentedStandardError,
        optimumValue,
        optimumStandardError,
    ];
    return measurements.every(Number.isFinite)
        ? [
              {
                  standardError: documentedStandardError,
                  value: documentedValue,
              },
              { standardError: optimumStandardError, value: optimumValue },
          ]
        : null;
}

function wholeCentLevels(
    span: number,
    minimumLevels: number,
    maximumLevels: number,
): null | number {
    const spanCents = Math.round(span * CENTS_PER_DOLLAR);
    for (let levels = minimumLevels; levels <= maximumLevels; levels++) {
        if (spanCents % (levels - 1) === 0) return levels;
    }
    return null;
}
