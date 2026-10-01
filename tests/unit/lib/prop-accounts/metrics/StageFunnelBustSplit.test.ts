import { describe, expect, it } from 'vitest';

import {
    BustDiagnosisKind,
    BustEvidenceKind,
} from '~/lib/prop-accounts/conduct';
import {
    AccountEventKind,
    AccountStatus,
    BustCause,
    firmKeyId,
    FirmKeyKind,
    RuleViolationKind,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    bustDiagnosisOfAttempt,
    bustSplitByFirm,
    type LedgerAccountRow,
} from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    purchased,
} from './ledgerFixtures';

const ATTEMPT = { purchasedOn: '2026-09-01' };

function bust(cause: BustCause | undefined, occurredOn: string) {
    return {
        detail: cause === undefined ? {} : { bustCause: cause },
        kind: AccountEventKind.Busted,
        occurredOn,
    };
}

function followed(decidedOn: string) {
    return {
        acceptedRiskCents: usdCents(40_000),
        actualRiskCents: usdCents(30_000),
        decidedOn,
    };
}

function modeledKeyId(firm: typeof EVAL_PLAN): string {
    return firmKeyId({ firmId: firm.firm.id, kind: FirmKeyKind.Modeled });
}

function violation(occurredOn: string) {
    return { kind: RuleViolationKind.Oversize, occurredOn };
}

describe('bustDiagnosisOfAttempt', () => {
    it('returns null when the attempt has no bust event', () => {
        expect(
            bustDiagnosisOfAttempt(
                {
                    ...ATTEMPT,
                    events: [
                        {
                            kind: AccountEventKind.Purchased,
                            occurredOn: '2026-09-01',
                        },
                    ],
                },
                [followed('2026-09-02')],
                [],
            ),
        ).toBeNull();
    });

    it('is structural with violation evidence when a violation sits inside the attempt window', () => {
        const diagnosis = bustDiagnosisOfAttempt(
            {
                ...ATTEMPT,
                events: [bust(BustCause.MaxDrawdown, '2026-09-20')],
            },
            [followed('2026-09-05')],
            [violation('2026-09-10')],
        );
        expect(diagnosis?.kind).toBe(BustDiagnosisKind.Structural);
        expect(diagnosis?.evidence.map((item) => item.kind)).toEqual([
            BustEvidenceKind.Violation,
        ]);
    });

    it('is within-plan for a followed decision under a max drawdown bust', () => {
        expect(
            bustDiagnosisOfAttempt(
                {
                    ...ATTEMPT,
                    events: [bust(BustCause.MaxDrawdown, '2026-09-20')],
                },
                [followed('2026-09-05')],
                [],
            )?.kind,
        ).toBe(BustDiagnosisKind.WithinPlan);
    });

    it('is unknown without a recorded decision, and without a bust cause', () => {
        expect(
            bustDiagnosisOfAttempt(
                {
                    ...ATTEMPT,
                    events: [bust(BustCause.MaxDrawdown, '2026-09-20')],
                },
                [],
                [],
            )?.kind,
        ).toBe(BustDiagnosisKind.Unknown);
        expect(
            bustDiagnosisOfAttempt(
                { ...ATTEMPT, events: [bust(undefined, '2026-09-20')] },
                [followed('2026-09-05')],
                [],
            )?.kind,
        ).toBe(BustDiagnosisKind.Unknown);
    });

    it('is structural for a structural bust cause with no other evidence', () => {
        expect(
            bustDiagnosisOfAttempt(
                {
                    ...ATTEMPT,
                    events: [bust(BustCause.DailyLossLimit, '2026-09-20')],
                },
                [],
                [],
            )?.kind,
        ).toBe(BustDiagnosisKind.Structural);
    });

    it('keeps the window inclusive at both ends and drops rows outside it', () => {
        const attempt = {
            ...ATTEMPT,
            events: [bust(BustCause.MaxDrawdown, '2026-09-20')],
        };
        expect(
            bustDiagnosisOfAttempt(attempt, [], [violation('2026-09-01')])
                ?.kind,
        ).toBe(BustDiagnosisKind.Structural);
        expect(
            bustDiagnosisOfAttempt(attempt, [], [violation('2026-09-20')])
                ?.kind,
        ).toBe(BustDiagnosisKind.Structural);
        expect(
            bustDiagnosisOfAttempt(attempt, [], [violation('2026-08-31')])
                ?.kind,
        ).toBe(BustDiagnosisKind.Unknown);
        expect(
            bustDiagnosisOfAttempt(attempt, [], [violation('2026-09-21')])
                ?.kind,
        ).toBe(BustDiagnosisKind.Unknown);
        expect(
            bustDiagnosisOfAttempt(attempt, [followed('2026-09-21')], [])?.kind,
        ).toBe(BustDiagnosisKind.Unknown);
        expect(
            bustDiagnosisOfAttempt(attempt, [followed('2026-09-20')], [])?.kind,
        ).toBe(BustDiagnosisKind.WithinPlan);
    });

    it('diagnoses against the latest bust event when there are several', () => {
        expect(
            bustDiagnosisOfAttempt(
                {
                    ...ATTEMPT,
                    events: [
                        bust(BustCause.DailyLossLimit, '2026-09-10'),
                        bust(BustCause.MaxDrawdown, '2026-09-20'),
                    ],
                },
                [followed('2026-09-05')],
                [],
            )?.kind,
        ).toBe(BustDiagnosisKind.WithinPlan);
    });
});

describe('bustSplitByFirm', () => {
    it('counts each busted account once under its firm by diagnosis kind and ignores accounts that did not bust', () => {
        const structural = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const withinPlan = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const unknown = account(OTHER_FIRM_EVAL_PLAN, {
            status: AccountStatus.Busted,
        });
        const active = account(EVAL_PLAN);
        const result = bustSplitByFirm(
            ledgerOf([structural, withinPlan, unknown, active], [
                purchased(structural),
                event(structural, AccountEventKind.Busted, '2026-09-20', {
                    detail: { bustCause: BustCause.MaxDrawdown },
                }),
                purchased(withinPlan),
                event(withinPlan, AccountEventKind.Busted, '2026-09-20', {
                    detail: { bustCause: BustCause.MaxDrawdown },
                }),
                purchased(unknown),
                event(unknown, AccountEventKind.Busted, '2026-09-20'),
                purchased(active),
            ]),
            [
                { ...followed('2026-09-05'), accountId: withinPlan.id },
                { ...followed('2026-09-05'), accountId: active.id },
            ],
            [{ ...violation('2026-09-10'), accountId: structural.id }],
        );
        expect(result.get(modeledKeyId(EVAL_PLAN))).toEqual({
            structuralBusts: 1,
            unknownBusts: 0,
            withinPlanBusts: 1,
        });
        expect(result.get(modeledKeyId(OTHER_FIRM_EVAL_PLAN))).toEqual({
            structuralBusts: 0,
            unknownBusts: 1,
            withinPlanBusts: 0,
        });
        expect(result.size).toBe(2);
    });

    it('counts a busted account with no bust event as unknown, never within-plan', () => {
        const noEvent = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const result = bustSplitByFirm(
            ledgerOf([noEvent], [purchased(noEvent)]),
            [{ ...followed('2026-09-05'), accountId: noEvent.id }],
            [],
        );
        expect(result.get(modeledKeyId(EVAL_PLAN))).toEqual({
            structuralBusts: 0,
            unknownBusts: 1,
            withinPlanBusts: 0,
        });
    });

    it('counts only the busts the funnel row counts, leaving an unresolved busted account out of its firm and out of a firm of its own', () => {
        const resolved = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const corrupt = account(EVAL_PLAN, {
            optIns: 'broken' as unknown as LedgerAccountRow['optIns'],
            status: AccountStatus.Busted,
        });
        const removed = account(OTHER_FIRM_EVAL_PLAN, {
            firmId: 'gone-firm',
            status: AccountStatus.Busted,
        });
        const portfolio = ledgerOf([resolved, corrupt, removed], [
            purchased(resolved),
            event(resolved, AccountEventKind.Busted, '2026-09-20'),
            purchased(corrupt),
            event(corrupt, AccountEventKind.Busted, '2026-09-20', {
                detail: { bustCause: BustCause.DailyLossLimit },
            }),
            purchased(removed),
            event(removed, AccountEventKind.Busted, '2026-09-20'),
        ]);
        const result = bustSplitByFirm(portfolio, [], []);
        expect(portfolio.unresolvedAccounts).toHaveLength(2);
        expect(result.get(modeledKeyId(EVAL_PLAN))).toEqual({
            structuralBusts: 0,
            unknownBusts: 1,
            withinPlanBusts: 0,
        });
        expect(result.size).toBe(1);
    });

    it('does not borrow another account violation or decision', () => {
        const target = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const other = account(EVAL_PLAN);
        const result = bustSplitByFirm(
            ledgerOf([target, other], [
                purchased(target),
                event(target, AccountEventKind.Busted, '2026-09-20', {
                    detail: { bustCause: BustCause.MaxDrawdown },
                }),
            ]),
            [{ ...followed('2026-09-05'), accountId: other.id }],
            [{ ...violation('2026-09-10'), accountId: other.id }],
        );
        expect(result.get(modeledKeyId(EVAL_PLAN))).toEqual({
            structuralBusts: 0,
            unknownBusts: 1,
            withinPlanBusts: 0,
        });
    });
});

function ledgerOf(
    accounts: Parameters<typeof ledger>[0]['accounts'],
    events: Parameters<typeof ledger>[0]['events'],
) {
    return ledger({ accounts, events });
}
