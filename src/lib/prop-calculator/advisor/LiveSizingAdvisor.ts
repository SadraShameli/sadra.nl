import {
    dollars,
    type Dollars,
    resolveLiveAffordableRoom,
} from '~/lib/prop-calculator/core';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

import { type AccountSubstate } from './AccountSubstate';
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
import { NO_COMMISSION } from './DocumentedSizing';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type EngineOptimumRunnerResult } from './EngineOptimumRunner';
import { payoutAdvice } from './PayoutAdvice';
import { type LivePayoutRuleContext } from './PayoutRequestRule';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
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

    private payoutRuleContext(): LivePayoutRuleContext | null {
        const {
            account,
            paidPayoutsSinceLastLiveAccount,
            personalPayoutOverride,
            personalRetainedCushion,
        } = this.input;
        if (account.livePlan === null || account.state === null) {
            return null;
        }
        return {
            livePlan: account.livePlan,
            paidPayoutsSinceLastLiveAccount:
                paidPayoutsSinceLastLiveAccount ?? null,
            personalRequestOverride: personalPayoutOverride ?? null,
            personalRetainedCushion: personalRetainedCushion ?? null,
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
            differenceReasons: [],
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
        );
        return riskCaps(dollars(room.room), null, personal);
    }

    protected override engineRequests(): readonly EngineOptimumRequest[] {
        return [];
    }

    staleness(): AdviceStaleness {
        const { planRulesFingerprint, rulebook, snapshotAsOf, today } =
            this.input;
        return adviceStaleness({
            asOf: snapshotAsOf,
            fundedStaleDays: rulebook.review.fundedStaleDays,
            planRulesFingerprint: planRulesFingerprint ?? null,
            stage: SizingStage.Live,
            today,
        });
    }

    protected override buildContextOrNull(): LiveRuleContext | null {
        const { account, personalCaps, personalDll } = this.input;
        if (account.cushion === null) return null;
        const cushion = dollars(account.cushion);
        if (account.livePlan === null || account.state === null) {
            return {
                ceiling: null,
                contractLimit: null,
                cushion,
                dayStartDllRoom: null,
                instrument: null,
                liveCushionPercent: null,
                personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
                personalDll: personalDll ?? null,
                placeableMinimum: dollars(0.01),
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
            instrument: null,
            liveCushionPercent: livePlan.cushionPercentFor(state),
            personalCaps: personalCaps ?? NO_PERSONAL_CAPS,
            personalDll: personalDll ?? null,
            placeableMinimum: dollars(0.01),
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

function dollarsOrNull(amount: null | number): Dollars | null {
    return amount === null ? null : dollars(amount);
}
