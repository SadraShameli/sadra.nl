import { describe, expect, it } from 'vitest';

import {
    AlertEvaluator,
    type AlertEventRow,
    AlertKind,
} from '~/lib/prop-accounts/alerts';
import { AccountEventKind, AccountStage } from '~/lib/prop-accounts/core';
import { ALL_FIRMS, type FirmId, type Plan } from '~/lib/prop-calculator';

import { accountFor, contextOf, paidPayout, snapshotFor } from './alertFixtures';

const VERIFIED_FIRM_POLICY_KINDS: ReadonlySet<AlertKind> = new Set([
    AlertKind.CalendarInactivity,
    AlertKind.ConductPattern,
    AlertKind.CooldownActive,
    AlertKind.LiveExclusivity,
    AlertKind.LiveTriggerNear,
]);

interface PlanEntry {
    readonly firmId: FirmId;
    readonly plan: Plan;
}

const REGISTRY: readonly PlanEntry[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({ firmId: firm.id, plan })),
);

describe('firm-policy alert rules stay silent on every real (unverified) firm', () => {
    it('never fires a verification-gated firm-policy alert kind for a real firm registry entry, however aggressively the account is set up', () => {
        const evaluator = new AlertEvaluator();
        for (const entry of REGISTRY) {
            const live = accountFor(entry, { stage: AccountStage.Live });
            const sibling = accountFor(entry, {
                stage: entry.plan.isInstantFunded
                    ? AccountStage.Funded
                    : AccountStage.Eval,
            });
            const busted1 = accountFor(entry, { stage: AccountStage.Eval });
            const busted2 = accountFor(entry, { stage: AccountStage.Eval });
            const rebuySource = accountFor(entry, { stage: AccountStage.Eval });
            const rebuyTarget = accountFor(entry, { stage: AccountStage.Eval });
            const accounts = [
                live,
                sibling,
                busted1,
                busted2,
                rebuySource,
                rebuyTarget,
            ];
            const events: AlertEventRow[] = [
                { accountId: live.id, kind: AccountEventKind.MovedLive, occurredOn: '2026-08-01' },
                { accountId: live.id, kind: AccountEventKind.Busted, occurredOn: '2026-09-10' },
                { accountId: busted1.id, kind: AccountEventKind.Busted, occurredOn: '2026-09-05' },
                { accountId: busted2.id, kind: AccountEventKind.Busted, occurredOn: '2026-09-05' },
                { accountId: rebuySource.id, kind: AccountEventKind.Busted, occurredOn: '2026-09-01' },
                { accountId: rebuyTarget.id, kind: AccountEventKind.Purchased, occurredOn: '2026-09-03' },
            ];
            const payouts = Array.from({ length: 15 }, (_unused, index) =>
                paidPayout(sibling, {
                    paidOn: `2026-0${(index % 9) + 1}-0${(index % 8) + 1}`,
                    requestedOn: `2026-0${(index % 9) + 1}-0${(index % 8) + 1}`,
                }),
            );
            const snapshots = [
                snapshotFor(sibling, { lastTradedOn: '2026-01-01' }),
            ];
            const context = contextOf({
                accounts,
                events,
                payouts,
                snapshots,
                today: '2026-09-30',
            });
            const alerts = evaluator.evaluate(context);
            const newPolicyAlerts = alerts.filter((alert) =>
                VERIFIED_FIRM_POLICY_KINDS.has(alert.kind),
            );
            expect(newPolicyAlerts).toEqual([]);
        }
    });
});
