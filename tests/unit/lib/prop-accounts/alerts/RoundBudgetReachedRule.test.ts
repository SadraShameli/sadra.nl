import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    RoundBudgetReachedRule,
} from '~/lib/prop-accounts/alerts';
import { RoundStatus } from '~/lib/prop-accounts/core';

import { alertsOf } from './alertFixtures';

const rule = new RoundBudgetReachedRule();

const SRC = path.resolve(
    import.meta.dirname,
    '../../../../../src/lib/prop-accounts',
);

describe('RoundBudgetReachedRule', () => {
    it('is silent below the budget', () => {
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        budget: {
                            budgetCents: 100_000,
                            isSpent: false,
                            remainingCents: 10_000,
                            spentCents: 90_000,
                        },
                        id: 'round-1',
                        label: 'September round',
                        status: RoundStatus.Open,
                    },
                ],
            }),
        ).toEqual([]);
    });

    it('fires Info once spend reaches the budget', () => {
        const alerts = alertsOf(rule, {
            rounds: [
                {
                    budget: {
                        budgetCents: 100_000,
                        isSpent: true,
                        remainingCents: 0,
                        spentCents: 100_000,
                    },
                    id: 'round-1',
                    label: 'September round',
                    status: RoundStatus.Open,
                },
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.RoundBudgetReached);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.subject.kind).toBe(AlertSubjectKind.Portfolio);
        expect(alerts[0]?.message).toContain('September round');
        expect(alerts[0]?.message).toContain('$1,000.00');
    });

    it('fires past the budget too', () => {
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        budget: {
                            budgetCents: 100_000,
                            isSpent: true,
                            remainingCents: -10_000,
                            spentCents: 110_000,
                        },
                        id: 'round-1',
                        label: 'September round',
                        status: RoundStatus.Open,
                    },
                ],
            }),
        ).toHaveLength(1);
    });

    it('is silent with no budget set', () => {
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        budget: {
                            budgetCents: null,
                            isSpent: false,
                            remainingCents: null,
                            spentCents: 100_000,
                        },
                        id: 'round-1',
                        label: 'September round',
                        status: RoundStatus.Open,
                    },
                ],
            }),
        ).toEqual([]);
    });

    it('is silent on a closed round', () => {
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        budget: {
                            budgetCents: 100_000,
                            isSpent: true,
                            remainingCents: 0,
                            spentCents: 100_000,
                        },
                        id: 'round-1',
                        label: 'September round',
                        status: RoundStatus.Closed,
                    },
                ],
            }),
        ).toEqual([]);
    });
});

function budgetWith(isSpent: boolean) {
    return {
        budgetCents: 100_000,
        isSpent,
        remainingCents: 0,
        spentCents: 100_000,
    };
}

describe('RoundBudgetReachedRule follows the shared spent predicate', () => {
    it('fires exactly when the open round budget reports isSpent', () => {
        const round = { id: 'round-1', label: 'September round' };
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        ...round,
                        budget: budgetWith(false),
                        status: RoundStatus.Open,
                    },
                ],
            }),
        ).toEqual([]);
        expect(
            alertsOf(rule, {
                rounds: [
                    {
                        ...round,
                        budget: budgetWith(true),
                        status: RoundStatus.Open,
                    },
                ],
            }),
        ).toHaveLength(1);
    });

    it('derives spent from the cents once across prop-accounts, in roundBudgetStatus', () => {
        const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
            .map((entry) => path.join(entry.parentPath, entry.name));
        const derivations = files
            .filter((file) =>
                /spentCents\s*>=\s*(?:round\.budget\.)?budgetCents/u.test(
                    readFileSync(file, 'utf8'),
                ),
            )
            .map((file) => path.relative(SRC, file).replaceAll('\\', '/'));
        expect(derivations).toEqual(['bankroll/RoundBudget.ts']);
    });
});
