import { describe, expect, it } from 'vitest';

import {
    type AlertContext,
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    createAlertContext,
    EvalDayCapRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, PlanKeyResolutionKind } from '~/lib/prop-accounts/core';
import { type Plan } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    accountFor,
    alertsOf,
    ledgerOnlyAccountFor,
    planWhere,
    snapshotFor,
    WEDNESDAY,
} from './alertFixtures';

const CAPPED = planWhere(
    (plan) => plan.maxEvalTradingDays !== null && !plan.isInstantFunded,
);
const UNCAPPED = planWhere(
    (plan) => plan.maxEvalTradingDays === null && !plan.isInstantFunded,
);
const MAX_DAYS = CAPPED.plan.maxEvalTradingDays ?? 0;
const rule = new EvalDayCapRule();

function alertsAt(
    tradingDays: null | number,
    overrides: {
        entry?: typeof CAPPED;
        purchasedOn?: string;
        rulebook?: typeof DEFAULT_RULEBOOK;
        stage?: AccountStage;
        today?: string;
        withSnapshot?: boolean;
    } = {},
) {
    const account = accountFor(overrides.entry ?? CAPPED, {
        purchasedOn: overrides.purchasedOn ?? WEDNESDAY,
        stage: overrides.stage ?? AccountStage.Eval,
    });
    return alertsOf(rule, {
        accounts: [account],
        rulebook: overrides.rulebook ?? DEFAULT_RULEBOOK,
        snapshots:
            overrides.withSnapshot === false
                ? []
                : [snapshotFor(account, { tradingDays })],
        today: overrides.today ?? WEDNESDAY,
    });
}

describe('EvalDayCapRule', () => {
    it('is silent while more than the warning days remain', () => {
        expect(alertsAt(MAX_DAYS - 6)).toEqual([]);
    });

    it('warns when the remaining eval days reach the rulebook threshold', () => {
        const alerts = alertsAt(MAX_DAYS - 5);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.EvalDayCapNear);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('5 eval trading days left');
        expect(alerts[0]?.message).toContain(String(MAX_DAYS));
    });

    it('is critical once the cap is used up', () => {
        const alerts = alertsAt(MAX_DAYS);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toContain(`${MAX_DAYS} of ${MAX_DAYS}`);
    });

    it('reads the warning days from the rulebook', () => {
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            alerts: { ...DEFAULT_RULEBOOK.alerts, evalDaysRemainingWarning: 2 },
        };
        expect(alertsAt(MAX_DAYS - 3, { rulebook })).toEqual([]);
        expect(alertsAt(MAX_DAYS - 2, { rulebook })).toHaveLength(1);
    });

    it('warns from the sessions elapsed since purchase when few days were traded', () => {
        const alerts = alertsAt(10, {
            purchasedOn: '2026-09-01',
            today: '2026-09-29',
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            `${MAX_DAYS - 20} eval trading days left`,
        );
        expect(alerts[0]?.message).toContain('20 sessions since the purchase');
        expect(alerts[0]?.disclosures).toContain(
            AlertDisclosure.NoHolidayCalendar,
        );
    });

    it('is critical once the elapsed sessions reach the cap, whatever was traded', () => {
        const alerts = alertsAt(3, {
            purchasedOn: '2026-09-01',
            today: '2026-09-30',
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toContain(`${MAX_DAYS} of ${MAX_DAYS}`);
    });

    it('checks the calendar without a snapshot', () => {
        const alerts = alertsAt(null, {
            purchasedOn: '2026-09-01',
            withSnapshot: false,
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('5 eval trading days left');
        expect(alertsAt(null, { withSnapshot: false })).toEqual([]);
    });

    it('checks the calendar when the snapshot has no trading days', () => {
        expect(alertsAt(null)).toEqual([]);
        expect(alertsAt(null, { purchasedOn: '2026-08-01' })[0]?.severity).toBe(
            AlertSeverity.Critical,
        );
    });

    it('counts no sessions for a purchase dated after today', () => {
        expect(alertsAt(0, { purchasedOn: '2026-10-05' })).toEqual([]);
    });

    it('skips a ledger-only eval account, which has no plan cap to count against', () => {
        const account = ledgerOnlyAccountFor(CAPPED, {
            purchasedOn: '2026-01-05',
            stage: AccountStage.Eval,
        });
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { tradingDays: 500 })],
                today: WEDNESDAY,
            }),
        ).toEqual([]);
    });

    it('applies only to eval accounts on plans with an eval day cap', () => {
        expect(alertsAt(MAX_DAYS, { stage: AccountStage.Funded })).toEqual([]);
        expect(
            alertsAt(1000, { entry: UNCAPPED, purchasedOn: '2020-01-01' }),
        ).toEqual([]);
    });

    describe('the PT-35 eval access window (calendar days)', () => {
        const WINDOW_DAYS = 10;

        function alertsWithPlan(
            plan: Plan,
            options: {
                purchasedOn: string;
                today: string;
                tradingDays?: null | number;
            },
        ) {
            const account = accountFor(UNCAPPED, {
                purchasedOn: options.purchasedOn,
                stage: AccountStage.Eval,
            });
            const context: AlertContext = createAlertContext({
                accounts: [account],
                accountStates: [],
                copyGroups: [],
                payouts: [],
                rulebook: DEFAULT_RULEBOOK,
                snapshots: [
                    snapshotFor(account, {
                        tradingDays: options.tradingDays ?? 0,
                    }),
                ],
                today: options.today,
            });
            const resolved: AlertContext = {
                ...context,
                accounts: context.accounts.map((monitored) => ({
                    ...monitored,
                    plan: { kind: PlanKeyResolutionKind.Resolved, plan },
                })),
            };
            return rule.evaluate(resolved);
        }

        const withWindow = UNCAPPED.plan.withOverrides({
            evalAccessWindowDays: WINDOW_DAYS,
        });

        it('is silent while more than the warning days remain in the window', () => {
            expect(
                alertsWithPlan(withWindow, {
                    purchasedOn: '2026-09-01',
                    today: '2026-09-03',
                }),
            ).toEqual([]);
        });

        it('warns from the calendar window when it binds tighter than the trading-day cap', () => {
            const alerts = alertsWithPlan(withWindow, {
                purchasedOn: '2026-09-01',
                today: '2026-09-06',
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
            expect(alerts[0]?.message).toContain('eval access days left');
            expect(alerts[0]?.message).toContain(
                `${WINDOW_DAYS} calendar days`,
            );
        });

        it('is critical once the calendar window is used up', () => {
            const alerts = alertsWithPlan(withWindow, {
                purchasedOn: '2026-09-01',
                today: '2026-09-11',
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('Eval access window reached');
        });

        it('is silent for a plan with no eval access window', () => {
            expect(
                alertsWithPlan(UNCAPPED.plan, {
                    purchasedOn: '2026-09-01',
                    today: '2026-09-11',
                }),
            ).toEqual([]);
        });

        it('binds on the trading-day cap instead when it is tighter than the calendar window', () => {
            const bothCapped = CAPPED.plan.withOverrides({
                evalAccessWindowDays: 365,
            });
            const alerts = alertsWithPlan(bothCapped, {
                purchasedOn: '2020-01-01',
                today: '2020-01-01',
                tradingDays: MAX_DAYS,
            });
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain(`${MAX_DAYS} of ${MAX_DAYS}`);
        });
    });
});
