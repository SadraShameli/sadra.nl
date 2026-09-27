import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    DEFAULT_ALERT_RULES,
    IdleSessionLimitRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import { addIsoDays, TradingPhase } from '~/lib/prop-calculator';

import {
    accountFor,
    alertsOf,
    ledgerOnlyAccountFor,
    planWhere,
    snapshotFor,
    WEDNESDAY,
} from './alertFixtures';

const WITH_LIMIT = planWhere(
    (plan) =>
        !plan.isInstantFunded &&
        plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval) !== null,
);
const LIMIT = WITH_LIMIT.plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval);
if (LIMIT === null) throw new Error('expected a configured idle limit');

const rule = new IdleSessionLimitRule();

function alertsAt(
    lastTradedOn: null | string,
    overrides: {
        stage?: AccountStage;
        today?: string;
    } = {},
) {
    const stage = overrides.stage ?? AccountStage.Eval;
    const account = accountFor(WITH_LIMIT, { stage });
    return alertsOf(rule, {
        accounts: [account],
        snapshots: [snapshotFor(account, { lastTradedOn })],
        today: overrides.today ?? WEDNESDAY,
    });
}

function daysBefore(isoDate: string, days: number): string {
    return addIsoDays(isoDate, -days);
}

describe('IdleSessionLimitRule', () => {
    it('is silent well within the limit', () => {
        expect(alertsAt(WEDNESDAY)).toEqual([]);
    });

    it('is silent without a last-traded date', () => {
        expect(alertsAt(null)).toEqual([]);
    });

    it('warns two days before the limit and discloses the engine approximation', () => {
        const today = WEDNESDAY;
        const lastTradedOn = daysBefore(today, LIMIT - 2);
        const alerts = alertsAt(lastTradedOn, { today });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.IdleSessionLimit);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(String(LIMIT - 2));
        expect(alerts[0]?.message).toContain(String(LIMIT));
        expect(alerts[0]?.message).toContain('calendar days');
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.SessionLimitApproximatedAsCalendarDays,
        ]);
    });

    it('is critical once the idle calendar days reach the limit', () => {
        const today = WEDNESDAY;
        const lastTradedOn = daysBefore(today, LIMIT);
        const alerts = alertsAt(lastTradedOn, { today });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.SessionLimitApproximatedAsCalendarDays,
        ]);
    });

    it('is silent more than two days before the limit', () => {
        const today = WEDNESDAY;
        const lastTradedOn = daysBefore(today, LIMIT - 3);
        expect(alertsAt(lastTradedOn, { today })).toEqual([]);
    });

    it('never fires for a live-stage account', () => {
        expect(
            alertsAt(daysBefore(WEDNESDAY, LIMIT), {
                stage: AccountStage.Live,
            }),
        ).toEqual([]);
    });

    it('skips a ledger-only account, which the calculator does not model', () => {
        const account = ledgerOnlyAccountFor(WITH_LIMIT, {
            stage: AccountStage.Eval,
        });
        const lastTradedOn = daysBefore(WEDNESDAY, LIMIT);
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { lastTradedOn })],
            }),
        ).toEqual([]);
    });

    it('is registered with the default alert rules', () => {
        expect(
            DEFAULT_ALERT_RULES.some(
                (candidate) => candidate instanceof IdleSessionLimitRule,
            ),
        ).toBe(true);
    });
});
