import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    applyLifecycleEvent,
    compareText,
    describeLedgerOnlyLifecycleRejection,
    describeLifecycleRejection,
    impliedEvalPassOn,
    isLedgerOnlySnapshotField,
    LEDGER_ONLY_LIFECYCLE_FACTS,
    LEDGER_ONLY_SNAPSHOT_FIELD_LIST,
    LEDGER_ONLY_SNAPSHOT_FIELD_NAMES,
    LEDGER_ONLY_SNAPSHOT_FIELDS,
    LifecycleOutcomeKind,
    LifecycleRejection,
    SnapshotField,
} from '~/lib/prop-accounts';

describe('LEDGER_ONLY_SNAPSHOT_FIELDS', () => {
    it('holds the balance, the dashboard floor and the payout totals, in form order', () => {
        expect(LEDGER_ONLY_SNAPSHOT_FIELDS).toEqual([
            SnapshotField.AsOf,
            SnapshotField.Balance,
            SnapshotField.DashboardFloor,
            SnapshotField.PayoutsTaken,
            SnapshotField.CumulativePayout,
        ]);
    });

    it.each(Object.values(SnapshotField))(
        'isLedgerOnlySnapshotField(%s) agrees with the field set',
        (field) => {
            expect(isLedgerOnlySnapshotField(field)).toBe(
                (LEDGER_ONLY_SNAPSHOT_FIELDS as readonly string[]).includes(
                    field,
                ),
            );
        },
    );

    it('names every field of the set in its list, in the set order', () => {
        expect(LEDGER_ONLY_SNAPSHOT_FIELD_LIST).toBe(
            'the snapshot date, the balance, the dashboard floor, the payouts taken and the cumulative payouts',
        );
        const positions = LEDGER_ONLY_SNAPSHOT_FIELDS.map((field) =>
            LEDGER_ONLY_SNAPSHOT_FIELD_LIST.indexOf(
                LEDGER_ONLY_SNAPSHOT_FIELD_NAMES[field],
            ),
        );
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect(positions).toEqual(positions.toSorted((a, b) => a - b));
        expect(
            Object.keys(LEDGER_ONLY_SNAPSHOT_FIELD_NAMES).toSorted(compareText),
        ).toEqual(LEDGER_ONLY_SNAPSHOT_FIELDS.toSorted(compareText));
    });

    it('never counts a non-snapshot key as a ledger-only field', () => {
        for (const key of ['accountId', 'source', '', 'tradingDays']) {
            expect(isLedgerOnlySnapshotField(key)).toBe(false);
        }
    });
});

describe('LEDGER_ONLY_LIFECYCLE_FACTS', () => {
    it('has no funded reset and no instant funding', () => {
        expect(LEDGER_ONLY_LIFECYCLE_FACTS).toEqual({
            fundedReset: null,
            isInstantFunded: false,
        });
    });

    it('bounds a Funded or Live ledger-only account by its funded date like a modeled evaluation plan', () => {
        for (const stage of [AccountStage.Funded, AccountStage.Live]) {
            expect(
                impliedEvalPassOn(
                    {
                        fundedOn: '2026-09-15',
                        purchasedOn: '2026-09-01',
                        stage,
                    },
                    LEDGER_ONLY_LIFECYCLE_FACTS,
                    false,
                ),
            ).toEqual({ dateKnown: true, on: '2026-09-15' });
        }
    });

    it('refuses a funded reset on a busted funded ledger-only account', () => {
        expect(
            applyLifecycleEvent(
                LEDGER_ONLY_LIFECYCLE_FACTS,
                { stage: AccountStage.Funded, status: AccountStatus.Busted },
                AccountEventKind.FundedReset,
            ),
        ).toEqual({
            kind: LifecycleOutcomeKind.Rejected,
            reason: LifecycleRejection.FundedResetNotOffered,
        });
    });
});

describe('describeLedgerOnlyLifecycleRejection', () => {
    it('says a funded reset needs plan rules and how to record a reinstatement instead', () => {
        const text = describeLedgerOnlyLifecycleRejection(
            LifecycleRejection.FundedResetNotOffered,
            AccountStage.Funded,
        );
        expect(text).toMatch(/ledger-only/);
        expect(text).toMatch(/bust reversal/);
        expect(text).not.toMatch(/This plan/);
        expect(text).not.toContain('—');
    });

    it.each(
        Object.values(LifecycleRejection).filter(
            (reason) => reason !== LifecycleRejection.FundedResetNotOffered,
        ),
    )('describes %s with the ledger-only lifecycle facts', (reason) => {
        expect(
            describeLedgerOnlyLifecycleRejection(reason, AccountStage.Funded),
        ).toBe(
            describeLifecycleRejection(reason, {
                facts: LEDGER_ONLY_LIFECYCLE_FACTS,
                stage: AccountStage.Funded,
            }),
        );
    });
});
