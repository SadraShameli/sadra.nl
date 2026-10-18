import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    emptySnapshotFormValues,
    LEDGER_ONLY_SNAPSHOT_NOTICE,
    ledgerOnlySnapshotRules,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { SnapshotFields } from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import {
    AccountStage,
    AccountTracking,
    compareText,
    SnapshotField,
    snapshotFieldRules,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';

const AS_OF = '2026-09-25';

function anyPlan(): Plan {
    const [plan] = ALL_FIRMS.flatMap((firm) => firm.plans);
    if (plan === undefined) throw new Error('no plan in the registry');
    return plan;
}

describe('SnapshotFields for a ledger-only account', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(tracking: AccountTracking) {
        const common = {
            fieldWarnings: [],
            formIssues: [],
            formWarnings: [],
            issues: [],
            onChange: vi.fn(),
            values: emptySnapshotFormValues(AS_OF),
        };
        act(() => {
            root.render(
                tracking === AccountTracking.LedgerOnly ? (
                    <SnapshotFields {...common} tracking={tracking} />
                ) : (
                    <SnapshotFields
                        {...common}
                        rules={snapshotFieldRules(
                            anyPlan(),
                            AccountStage.Funded,
                        )}
                        tracking={tracking}
                    />
                ),
            );
        });
    }

    function inputIds(): string[] {
        return [...container.querySelectorAll('input')]
            .map((input) => input.id)
            .toSorted(compareText);
    }

    it('offers only the date, balance, dashboard floor, payouts taken and cumulative payouts', () => {
        render(AccountTracking.LedgerOnly);
        expect(inputIds()).toEqual(
            [
                SnapshotField.AsOf,
                SnapshotField.Balance,
                SnapshotField.CumulativePayout,
                SnapshotField.DashboardFloor,
                SnapshotField.PayoutsTaken,
            ]
                .map((field) => `snapshot-${field}`)
                .toSorted(compareText),
        );
    });

    it('takes its fields from the ledger-only rules, so ledger-only mode needs no rules from the caller', () => {
        render(AccountTracking.LedgerOnly);
        expect(
            [...container.querySelectorAll('label')].map((label) =>
                label.textContent.replace(/\s*\(.*\)$/, ''),
            ),
        ).toEqual(ledgerOnlySnapshotRules().map((rule) => rule.label));
    });

    it('says no plan plausibility check runs on a ledger-only snapshot', () => {
        render(AccountTracking.LedgerOnly);
        expect(container.textContent).toContain(LEDGER_ONLY_SNAPSHOT_NOTICE);
    });

    it('shows no ledger-only notice on a modeled account', () => {
        render(AccountTracking.Modeled);
        expect(container.textContent).not.toContain(
            LEDGER_ONLY_SNAPSHOT_NOTICE,
        );
        expect(inputIds()).toContain(`snapshot-${SnapshotField.TradingDays}`);
    });
});
