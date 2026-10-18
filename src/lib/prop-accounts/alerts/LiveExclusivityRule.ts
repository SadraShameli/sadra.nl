import { AccountStage, isEndedStatus } from '~/lib/prop-accounts/core';
import { PolicyVerification, SimAccountEffect } from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    type ResolvedFirmAccount,
    resolvedFirmAccountsOf,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class LiveExclusivityRule extends AlertRule {
    readonly kind = AlertKind.LiveExclusivity;

    private firmAlert(
        group: readonly ResolvedFirmAccount[],
    ): readonly AccountAlert[] {
        const live = group.find(
            (entry) => entry.monitored.account.stage === AccountStage.Live,
        );
        if (live === undefined) return [];
        const siblings = group.filter(
            (entry) =>
                entry.monitored.account.id !== live.monitored.account.id &&
                (entry.monitored.account.stage === AccountStage.Eval ||
                    entry.monitored.account.stage === AccountStage.Funded),
        );
        if (siblings.length === 0) return [];
        const policy = live.firm.accountPolicy.liveExclusivityFor(live.plan);
        if (policy.source?.verification !== PolicyVerification.Confirmed) {
            return [];
        }
        const description = descriptionFor(policy.simAccountEffect);
        if (description === null) return [];
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: `${live.monitored.account.label} is live; the firm's verified policy makes its other accounts ${description}`,
                severity: AlertSeverity.Warning,
                subject: {
                    accountIds: [
                        live.monitored.account.id,
                        ...siblings.map((entry) => entry.monitored.account.id),
                    ],
                    kind: AlertSubjectKind.Portfolio,
                },
            },
        ];
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const byFirmId = Map.groupBy(
            resolvedFirmAccountsOf(context).filter(
                (entry) => !isEndedStatus(entry.monitored.account.status),
            ),
            (entry) => entry.monitored.planKey.firmId,
        );
        return byFirmId
            .values()
            .flatMap((group) => this.firmAlert(group))
            .toArray();
    }
}

function descriptionFor(effect: SimAccountEffect): null | string {
    switch (effect) {
        case SimAccountEffect.Closed: {
            return 'closed while live';
        }
        case SimAccountEffect.Dormant: {
            return 'dormant while live';
        }
        case SimAccountEffect.Unknown: {
            return null;
        }
        case SimAccountEffect.UpgradedAccountOnHold: {
            return 'flagged and put on hold while live';
        }
    }
}
