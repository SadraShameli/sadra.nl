import {
    type AccountState,
    DayStopRuleKind,
    defaultLadderGridMax,
    dollars,
    type Dollars,
    type InstrumentSymbol,
    MAX_LADDER_GRID_SIZE,
    ONE_CENT,
    oneContractRisk,
    resolvePositionSizing,
    RungSizing,
    TradingPhase,
} from '../core';
import { firmDataProvenance } from '../describe';
import { type Advice } from './Advice';
import { adviceProvenance } from './AdviceProvenance';
import { AdviceSource } from './AdviceSource';
import {
    adviceStaleness,
    type AdviceStaleness,
    type PlanRulesFingerprintCheck,
} from './AdviceStaleness';
import { createDocumentedRule } from './createDocumentedRule';
import { NO_COMMISSION } from './DocumentedSizing';
import {
    type EngineLadderScoreConfig,
    type EngineOptimumRequest,
} from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import { type ReconstructedFundedOrEvalAccount } from './ReconstructedAccount';
import { contractLimitOf, riskCaps, type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { documentedRuleLabel, rulebookDeviation } from './RulebookDeviation';
import { type EvalRuleContext, ruleContextAt } from './RuleContext';
import { SizingAdvisor } from './SizingAdvisor';
import { SizingObjective } from './SizingObjective';
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
    readonly maxEvalDays: number;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly planRulesFingerprint?: null | PlanRulesFingerprintCheck;
    readonly positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    };
    readonly rulebook: RulebookParameters;
    readonly seed?: number;
    readonly sims?: number;
    readonly snapshotAsOf: string;
    readonly today: string;
}

export class EvalSizingAdvisor extends SizingAdvisor<EvalRuleContext> {
    private readonly input: EvalSizingAdvisorInput;

    constructor(input: EvalSizingAdvisorInput) {
        super(
            SizingStage.Eval,
            input.rulebook,
            createDocumentedRule(SizingStage.Eval, input.rulebook),
        );
        this.input = input;
    }

    private placeableMinimum(): Dollars {
        const { positionSizing } = this.input;
        if (positionSizing) {
            const resolved = resolvePositionSizing(
                positionSizing.instrument,
                positionSizing.stopPoints,
            );
            if (resolved) return dollars(oneContractRisk(resolved));
        }
        return ONE_CENT;
    }

    assemble(results: readonly EngineOptimumRunnerResult[]): Advice {
        const { account, snapshotAsOf, today } = this.input;
        const staleness = this.staleness();
        const documented = this.documented();
        const startBasis =
            elapsedDaysOf(account) > 0
                ? StartBasis.FromState
                : StartBasis.Fresh;
        return {
            assumptions: account.assumptions,
            dailyPlanCard: this.dailyPlanCard(),
            differenceReasons: [],
            documented,
            headline: documentedRuleLabel(rulebookDeviation(this.rulebook)),
            optima: results,
            payoutAdvice: null,
            provenance: adviceProvenance({
                computedAt: today,
                firmDataDate: firmDataProvenance(account.plan.id.firm)
                    .verifiedOn,
                objective: SizingObjective.MonthlyNet,
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

    caps(): RiskCaps {
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

    optimumRequests(): readonly EngineOptimumRequest[] {
        const { account, maxEvalDays, positionSizing, rulebook, seed, sims } =
            this.input;
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
            sims: sims ?? EVAL_LADDER_DEFAULT_SIMS,
            stopRule: { kind: DayStopRuleKind.DayGreen },
            winrate: rulebook.strategy.winrate,
            ...(isFromState && {
                startState: account.state,
                subscriptionElapsedDays: elapsedDays,
            }),
        };
        return [
            {
                grid: {
                    lo: EVAL_LADDER_GRID_LO,
                    max: defaultLadderGridMax(account.cushion),
                    slots: EVAL_LADDER_GRID_SLOTS,
                    step: EVAL_LADDER_GRID_STEP,
                },
                maxGridSize: EVAL_LADDER_MAX_GRID_SIZE,
                score,
                seed: seed ?? EVAL_LADDER_DEFAULT_SEED,
                source: isFromState
                    ? AdviceSource.LadderSearchFromState
                    : AdviceSource.LadderSearchFresh,
            },
        ];
    }

    staleness(): AdviceStaleness {
        const { planRulesFingerprint, rulebook, snapshotAsOf, today } =
            this.input;
        return adviceStaleness({
            asOf: snapshotAsOf,
            fundedStaleDays: rulebook.review.fundedStaleDays,
            planRulesFingerprint: planRulesFingerprint ?? null,
            stage: SizingStage.Eval,
            today,
        });
    }

    protected buildContext(): EvalRuleContext {
        const { account, personalCaps, personalDll, positionSizing } =
            this.input;
        return ruleContextAt(account.plan, SizingStage.Eval, account.state, {
            ceiling: null,
            instrument: positionSizing?.instrument ?? null,
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll ?? null,
            placeableMinimum: this.placeableMinimum(),
        });
    }
}

function elapsedDaysOf(account: { readonly state: AccountState }): number {
    return account.state.elapsedDays ?? 0;
}
