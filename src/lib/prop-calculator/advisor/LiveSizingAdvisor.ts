import {
    dollars,
    type Dollars,
    type InstrumentSymbol,
    type LiveAccountState,
    type LivePlan,
    ONE_CENT,
    resolveLiveAffordableRoom,
    resolveLiveFloorTradeRisk,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

import { type AccountSubstate } from './AccountSubstate';
import { type Advice } from './Advice';
import { adviceProvenance } from './AdviceProvenance';
import { AdviceSource } from './AdviceSource';
import {
    adviceStaleness,
    type AdviceStaleness,
    AdviceStalenessKind,
    type PlanRulesFingerprintCheck,
} from './AdviceStaleness';
import { type Assumption } from './Assumption';
import { createDocumentedRule } from './createDocumentedRule';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from './DifferenceReason';
import { NO_COMMISSION } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { payoutAdvice } from './PayoutAdvice';
import { type LivePayoutRuleContext } from './PayoutRequestRule';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import {
    advisorPlaceableMinimum,
    type SizingPlacement,
} from './PlaceableMinimum';
import { type ReconstructedLiveAccount } from './ReconstructedAccount';
import { riskCaps, type RiskCaps } from './RiskCaps';
import { type RulebookParameters } from './Rulebook';
import { documentedRuleLabel, rulebookDeviation } from './RulebookDeviation';
import { type LiveRuleContext } from './RuleContext';
import { SizingAdvisor } from './SizingAdvisor';
import { SizingObjective } from './SizingObjective';
import { SizingStage } from './SizingStage';
import { StartBasis } from './StartBasis';

export interface LiveSizingAdvisorInput {
    readonly account: ReconstructedLiveAccount;
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
    readonly snapshotAsOf: string;
    readonly substate: AccountSubstate.Suspended | null;
    readonly today: string;
}

export class LiveSizingAdvisor extends SizingAdvisor<LiveRuleContext> {
    private readonly input: LiveSizingAdvisorInput;

    constructor(input: LiveSizingAdvisorInput) {
        super(
            SizingStage.Live,
            input.rulebook,
            createDocumentedRule(SizingStage.Live, input.rulebook),
            input.substate,
        );
        this.input = input;
    }

    private assumptions(): readonly Assumption[] {
        return this.withLiveTriggersNotChecked(this.input.account.assumptions);
    }

    private differenceReasons(): readonly DifferenceReasonDetail[] {
        const { account, personalDll, positionSizing } = this.input;
        if (
            account.livePlan === null ||
            account.state === null ||
            this.staleness().kind === AdviceStalenessKind.Stale
        ) {
            return [];
        }
        const minimumTradeRisk = this.floorTradeRisk(
            account.livePlan,
            account.state,
        );
        const caps = this.sizedCaps();
        return minimumTradeRisk > 0
            ? [
                  {
                      affordableRisk: dollars(
                          Math.min(
                              caps.affordable,
                              caps.maxRiskPerTrade ?? caps.affordable,
                              personalDll ?? caps.affordable,
                          ),
                      ),
                      isPlacedAtEnteredStop:
                          isEnteredStopResolved(positionSizing),
                      kind: DifferenceReason.LiveFloorMinimumTrade,
                      minimumTradeRisk,
                  },
              ]
            : [];
    }

    private floorTradeRisk(
        livePlan: LivePlan,
        state: LiveAccountState,
    ): Dollars {
        return dollars(
            resolveLiveFloorTradeRisk(
                state.balance - state.threshold,
                livePlan.isFloorAlive(state),
                advisorPlaceableMinimum(this.input.positionSizing),
            ),
        );
    }

    private payoutRuleContext(): LivePayoutRuleContext | null {
        const {
            account,
            paidPayoutsSinceLastLiveAccount = null,
            personalPayoutOverride = null,
            personalRetainedCushion = null,
        } = this.input;
        if (account.livePlan === null || account.state === null) {
            return null;
        }
        return {
            livePlan: account.livePlan,
            paidPayoutsSinceLastLiveAccount: paidPayoutsSinceLastLiveAccount,
            personalRequestOverride: personalPayoutOverride,
            personalRetainedCushion: personalRetainedCushion,
            stage: SizingStage.Live,
            state: account.state,
        };
    }

    protected override assembleAdvice(
        results: readonly EngineOptimumRunnerResult[],
    ): Advice {
        const { account, rulebook, snapshotAsOf, today } = this.input;
        const staleness = this.staleness();
        const payoutRuleContext = this.payoutRuleContext();
        return {
            assumptions: this.assumptions(),
            dailyPlanCard: this.dailyPlanCard(),
            differenceReasons: this.differenceReasons(),
            documented: this.documented(),
            headline: documentedRuleLabel(rulebookDeviation(rulebook)),
            optima: results,
            payoutAdvice:
                payoutRuleContext === null
                    ? null
                    : payoutAdvice(rulebook, payoutRuleContext),
            provenance: adviceProvenance({
                computedAt: today,
                firmDataDate: firmDataProvenance(account.plan.id.firm)
                    .verifiedOn,
                objective: SizingObjective.MonthlyNet,
                planRulesFingerprint:
                    this.input.planRulesFingerprint?.current ?? null,
                snapshotDate: snapshotAsOf,
                source: AdviceSource.Documented,
                startBasis: StartBasis.Fresh,
            }),
            requests: [],
            stage: SizingStage.Live,
            staleness,
        };
    }

    protected override sizedCaps(): RiskCaps {
        const { account, personalCaps } = this.input;
        const personal = personalCaps ?? NO_PERSONAL_CAPS;
        if (account.livePlan === null || account.state === null) {
            return riskCaps(dollars(account.cushion ?? 0), null, personal);
        }
        const { livePlan, state } = account;
        const room = resolveLiveAffordableRoom(
            state.balance - state.threshold,
            livePlan.dailyLossLimitFor(state),
            state.todayPnL,
            NO_COMMISSION,
            this.floorTradeRisk(livePlan, state),
        );
        return riskCaps(dollars(room.room), null, personal);
    }

    protected override enteredPlacement(): null | SizingPlacement {
        return this.input.positionSizing ?? null;
    }

    protected override engineRequests(): readonly EngineOptimumRequest[] {
        return [];
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
            stage: SizingStage.Live,
            today,
        });
    }

    protected override buildContextOrNull(): LiveRuleContext | null {
        const { account, personalCaps, personalDll = null } = this.input;
        if (account.cushion === null) return null;
        const cushion = dollars(account.cushion);
        if (account.livePlan === null || account.state === null) {
            return {
                ceiling: null,
                contractLimit: null,
                cushion,
                dayStartDllRoom: null,
                floorTradeRisk: dollars(0),
                instrument: null,
                liveCushionPercent: null,
                personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
                personalDll: personalDll,
                placeableMinimum: ONE_CENT,
                stage: SizingStage.Live,
                thresholdLocked: false,
            };
        }
        const { livePlan, state } = account;
        return {
            ceiling: null,
            contractLimit: null,
            cushion,
            dayStartDllRoom: dollarsOrNull(livePlan.dailyLossLimitFor(state)),
            floorTradeRisk: this.floorTradeRisk(livePlan, state),
            instrument: null,
            liveCushionPercent: livePlan.cushionPercentFor(state),
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll,
            placeableMinimum: ONE_CENT,
            stage: SizingStage.Live,
            thresholdLocked: state.thresholdLocked,
        };
    }

    protected buildContext(): LiveRuleContext {
        const context = this.buildContextOrNull();
        if (context === null) {
            throw new Error(
                'LiveSizingAdvisor: no cushion is available to size this account (not modeled and no dashboard floor)',
            );
        }
        return context;
    }

    protected payoutEligibleForRiskCheck(): boolean {
        return this.isPayoutRequestDecision(this.payoutRuleContext());
    }
}

export function dollarsOrNull(
    amount: null | number | undefined,
): Dollars | null {
    return amount === null || amount === undefined ? null : dollars(amount);
}

function isEnteredStopResolved(
    positionSizing: LiveSizingAdvisorInput['positionSizing'],
): boolean {
    return (
        !!positionSizing &&
        resolvePositionSizing(
            positionSizing.instrument,
            positionSizing.stopPoints,
        ) !== null
    );
}
