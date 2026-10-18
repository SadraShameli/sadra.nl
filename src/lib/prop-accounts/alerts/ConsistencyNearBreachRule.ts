import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    type ConsistencyStatus,
    ConsistencyStatusKind,
    evalConsistencyStatus,
    fundedConsistencyStatus,
} from '~/lib/prop-accounts/metrics';
import {
    CENTS_PER_DOLLAR,
    type ConsistencyRule,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    documentedSizingOf,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const DOUBLE_TARGET_BEST_DAY_MULTIPLE = 2;

type EvaluatedConsistencyStatus = Extract<
    ConsistencyStatus,
    { kind: ConsistencyStatusKind.Evaluated }
>;

export class ConsistencyNearBreachRule extends AccountAlertRule {
    readonly kind = AlertKind.ConsistencyNearBreach;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const { reconstructed } = state.latest;
        const status = consistencyStatusOf(reconstructed);
        if (
            status?.kind !== ConsistencyStatusKind.Evaluated ||
            reconstructed.kind === ReconstructedLiveKind.Live
        )
            return null;
        if (status.isViolated) {
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                violationText(reconstructed, status),
            );
        }
        const documentedWin = documentedWinningDayOf(reconstructed, context);
        if (documentedWin === null) return null;
        const warning = warningTextOf(reconstructed, status, documentedWin);
        return warning === null
            ? null
            : this.alertFor(monitored, AlertSeverity.Warning, warning);
    }
}

function consistencyStatusOf(
    account: ReconstructedAccount,
): ConsistencyStatus | null {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            return null;
        }
        case TradingPhase.Eval: {
            return evalConsistencyStatus(
                account.plan,
                account.state.bestDayProfit,
                account.plan.accountProfit(account.state),
            );
        }
        case TradingPhase.Funded: {
            if (account.fundedTracker === null) return null;
            const tracker = account.fundedTracker;
            const cycleProfit =
                account.state.balance - tracker.lastPayoutBalance;
            return fundedConsistencyStatus(
                account.plan,
                tracker.payoutsIssued,
                tracker.cycleBestDayProfit,
                cycleProfit,
            );
        }
    }
}

function documentedWinningDayOf(
    account: ReconstructedFundedOrEvalAccount,
    context: AlertContext,
): null | number {
    switch (account.kind) {
        case TradingPhase.Eval: {
            const { rewardMultiple, rungs } = documentedSizingOf(
                account,
                context.rulebook,
            ).sizing;
            const [firstRung] = rungs;
            return firstRung === undefined
                ? null
                : firstRung.risk * rewardMultiple;
        }
        case TradingPhase.Funded: {
            return context.rulebook.funded.takeProfitCents / CENTS_PER_DOLLAR;
        }
    }
}

function dollarText(amount: number): string {
    return formatUsdCents(usdCentsFromDollars(amount));
}

function doubledTargetText(
    plan: Plan,
    status: EvaluatedConsistencyStatus,
): string {
    const doubledBestDay =
        DOUBLE_TARGET_BEST_DAY_MULTIPLE * status.bestDayProfit;
    const isTargetBinding = plan.profitTarget > doubledBestDay;
    const required = Math.max(plan.profitTarget, doubledBestDay);
    const more = Math.max(0, required - status.totalProfit);
    return `${status.violationEffectLabel}, so the account needs ${isTargetBinding ? 'its' : 'more than'} ${dollarText(required)} of profit${isTargetBinding ? ' (the profit target)' : ` (twice the ${dollarText(status.bestDayProfit)} best day)`}, ${dollarText(more)} more, to pass`;
}

function moreCycleProfitNeeded(
    rule: ConsistencyRule,
    bestDayProfit: number,
    totalProfit: number,
): number {
    if (rule.maxBestDayShare >= 1) return 0;
    const required = bestDayProfit / rule.maxBestDayShare;
    return Math.max(0, required - totalProfit);
}

function violationText(
    account: ReconstructedFundedOrEvalAccount,
    status: EvaluatedConsistencyStatus,
): string {
    const needed = moreCycleProfitNeeded(
        status.rule,
        status.bestDayProfit,
        status.totalProfit,
    );
    const lead = `Consistency already violated (max ${status.rule.shareLabel()} best day share)`;
    switch (account.kind) {
        case TradingPhase.Eval: {
            return status.violationEffectLabel === null
                ? `${lead}: ${dollarText(needed)} more profit needed to bring the best day back within the rule`
                : `${lead}: ${doubledTargetText(account.plan, status)}`;
        }
        case TradingPhase.Funded: {
            return `${lead}: ${dollarText(needed)} more cycle profit needed to bring the best day back within the rule`;
        }
    }
}

function warningTextOf(
    account: ReconstructedFundedOrEvalAccount,
    status: EvaluatedConsistencyStatus,
    documentedWin: number,
): null | string {
    const share = status.rule.shareLabel();
    switch (account.kind) {
        case TradingPhase.Eval: {
            const bestDay = Math.max(status.bestDayProfit, documentedWin);
            const profitAtPass = Math.max(
                status.totalProfit + documentedWin,
                account.plan.profitTarget,
            );
            return status.rule.isViolated(bestDay, profitAtPass)
                ? `One documented winning eval day of ${dollarText(documentedWin)} would break the ${share} consistency rule once the account holds ${dollarText(profitAtPass)} of profit (the profit target or more), with a best day of ${dollarText(bestDay)}`
                : null;
        }
        case TradingPhase.Funded: {
            const room = status.rule.maxDayProfitBeforeViolation(
                status.totalProfit,
            );
            return room < documentedWin
                ? `One documented winning day of ${dollarText(documentedWin)} would break the ${share} consistency rule (${dollarText(room)} of room left before violation)`
                : null;
        }
    }
}
