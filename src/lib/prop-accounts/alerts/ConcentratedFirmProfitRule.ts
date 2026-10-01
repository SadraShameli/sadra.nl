import { formatPercent } from '~/lib/format';
import {
    FirmKeyKind,
    firmKeyLabel,
    formatUsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    AccountStateUnavailableKind,
    type ConcentrationAccount,
    type FirmConcentration,
    type FirmProfitConcentration,
    firmProfitConcentrationOf,
} from '~/lib/prop-accounts/metrics';
import {
    type FirmPolicySource,
    LiveTriggerKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    isModeledMonitored,
    type ResolvedFirmAccount,
    resolvedFirmAccountsOf,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export const FIRM_CONCENTRATION_RECENT_PAYOUT_DAYS = 30;

enum FirmThresholdStance {
    PublishesNone = 'publishes-none',
    PublishesTrigger = 'publishes-trigger',
    Unverified = 'unverified',
}

const NON_NUMERIC_TRIGGER_KINDS: ReadonlySet<LiveTriggerKind> = new Set([
    LiveTriggerKind.Discretionary,
    LiveTriggerKind.NotChecked,
]);

const STANCE_TEXT: Readonly<Record<FirmThresholdStance, string>> = {
    [FirmThresholdStance.PublishesNone]:
        'The firm publishes no threshold for moving accounts live, so this limit is your own.',
    [FirmThresholdStance.PublishesTrigger]:
        "The firm's own published live trigger is tracked by the live trigger alert; this limit is your own.",
    [FirmThresholdStance.Unverified]:
        'No verified firm threshold is known for this firm, so this limit is your own.',
};

export class ConcentratedFirmProfitRule extends AlertRule {
    readonly kind = AlertKind.ConcentratedFirmProfit;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const {
            firmProfitConcentrationCount: count,
            firmProfitConcentrationShare: share,
        } = context.rulebook.alerts;
        if (count === null && share === null) return [];
        const resolved = Map.groupBy(
            resolvedFirmAccountsOf(context),
            (entry) => entry.monitored.planKey.firmId,
        );
        const flagged = firmProfitConcentrationOfContext(context).firms.filter(
            (firm) =>
                (count !== null && firm.inProfitAccounts >= count) ||
                (share !== null &&
                    firm.withdrawableShare !== null &&
                    firm.withdrawableShare >= share),
        );
        return flagged.length === 0
            ? []
            : [
                  {
                      disclosures: [],
                      kind: this.kind,
                      message: flagged
                          .map((firm) =>
                              messageOf(firm, resolved.get(firm.firmId) ?? []),
                          )
                          .join(' '),
                      severity: AlertSeverity.Warning,
                      subject: {
                          accountIds: flagged.flatMap(
                              (firm) => firm.inProfitAccountIds,
                          ),
                          kind: AlertSubjectKind.Portfolio,
                      },
                  },
              ];
    }
}

export function firmProfitConcentrationOfContext(
    context: AlertContext,
): FirmProfitConcentration {
    return firmProfitConcentrationOf(
        context.accounts
            .filter(isModeledMonitored)
            .map((monitored): ConcentrationAccount => ({
                accountId: monitored.account.id,
                firmId: monitored.planKey.firmId,
                isActive: isActive(monitored),
                movedLiveOn: monitored.movedLiveOn,
                paidPayouts: monitored.payouts,
                state: monitored.accountState ?? {
                    kind: AccountStateKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            })),
        {
            recentDays: FIRM_CONCENTRATION_RECENT_PAYOUT_DAYS,
            rulebook: context.rulebook,
            today: context.today,
        },
    );
}

function messageOf(
    firm: FirmConcentration,
    entries: readonly ResolvedFirmAccount[],
): string {
    const label = firmKeyLabel(
        { firmId: firm.firmId, kind: FirmKeyKind.Modeled },
        [],
    );
    const accounts =
        firm.inProfitAccounts === 1
            ? '1 funded account is'
            : `${String(firm.inProfitAccounts)} funded accounts are`;
    const share =
        firm.withdrawableShare === null
            ? ''
            : ` (${formatPercent(firm.withdrawableShare)} of everything withdrawable across your firms)`;
    const { payoutsSinceLastMovedLive: since, recentPayouts } = firm;
    const sinceText =
        since.since === null
            ? 'in total (no move live is recorded for this firm)'
            : `since the last move live on ${since.since}`;
    return `${label}: ${accounts} in profit with ${formatUsdCents(firm.withdrawableCents)} withdrawable${share}; ${String(recentPayouts.count)} paid in the last ${String(FIRM_CONCENTRATION_RECENT_PAYOUT_DAYS)} days (${formatUsdCents(usdCents(recentPayouts.cents))}), ${String(since.count)} paid ${sinceText} (${formatUsdCents(usdCents(since.cents))}). ${STANCE_TEXT[stanceOf(entries)]}`;
}

function stanceOf(
    entries: readonly ResolvedFirmAccount[],
): FirmThresholdStance {
    const triggers = entries.flatMap((entry) =>
        entry.firm.accountPolicy.liveTriggersFor(entry.plan),
    );
    const isConfirmed = (source: FirmPolicySource | undefined): boolean =>
        source?.verification === PolicyVerification.Confirmed;
    if (
        triggers.some(
            (trigger) =>
                !NON_NUMERIC_TRIGGER_KINDS.has(trigger.kind) &&
                isConfirmed(trigger.source),
        )
    ) {
        return FirmThresholdStance.PublishesTrigger;
    }
    return triggers.length > 0 &&
        triggers.every(
            (trigger) =>
                trigger.kind === LiveTriggerKind.Discretionary &&
                isConfirmed(trigger.source),
        )
        ? FirmThresholdStance.PublishesNone
        : FirmThresholdStance.Unverified;
}
