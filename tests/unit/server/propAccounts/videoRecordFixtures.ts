import {
    BankrollTransferKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    ReportedPayoutBasis,
    RoundStatus,
    RuleViolationKind,
    ViolationSource,
} from '~/lib/prop-accounts';
import { FirmId } from '~/lib/prop-calculator';

import { type FakeRow } from '../fakeDatabase';

export const VIDEO_IDS = {
    account: '11111111-1111-4111-8111-111111111111',
    bankrollTransfer: 'a1111111-1111-4111-8111-111111111111',
    decision: '33333333-3333-4333-8333-333333333333',
    externalFirm: 'b2222222-2222-4222-8222-222222222222',
    firmEngagement: 'c3333333-3333-4333-8333-333333333333',
    firmStatement: 'd4444444-4444-4444-8444-444444444444',
    round: 'e5555555-5555-4555-8555-555555555555',
    violation: 'f6666666-6666-4666-8666-666666666666',
} as const;

export const VIDEO_TABLES = {
    bankrollTransfer: 'sadranl_prop_bankroll_transfer',
    externalFirm: 'sadranl_prop_external_firm',
    firmEngagement: 'sadranl_prop_firm_engagement',
    firmStatement: 'sadranl_prop_firm_statement',
    round: 'sadranl_prop_round',
    violation: 'sadranl_prop_rule_violation',
} as const;

const CREATED_AT = new Date('2026-09-01T00:00:00Z');
const OWNER = 'user-owner';

export function bankrollTransferRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.bankrollTransfer,
        {
            amount_cents: 500_000,
            kind: BankrollTransferKind.Deposit,
            note: null,
            occurred_on: '2026-09-01',
        },
        overrides,
    );
}

export function externalFirmRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.externalFirm,
        { name: 'Hola Prime', notes: null },
        overrides,
    );
}

export function firmEngagementRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.firmEngagement,
        {
            external_firm_id: VIDEO_IDS.externalFirm,
            firm_id: null,
            note: null,
            reason: FirmEngagementReason.SentLive,
            sent_live_on: '2026-09-20',
            since_on: '2026-09-21',
            status: FirmEngagementStatus.Retired,
        },
        overrides,
    );
}

export function firmStatementRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.firmStatement,
        {
            as_of: '2026-09-21',
            basis: ReportedPayoutBasis.Gross,
            external_firm_id: null,
            firm_id: FirmId.Mffu,
            note: null,
            reported_payout_cents: 1_250_000,
        },
        overrides,
    );
}

export function roundRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.round,
        {
            budget_cents: 100_000,
            closed_on: null,
            external_firm_id: null,
            firm_id: FirmId.Mffu,
            label: 'September round',
            notes: null,
            opened_on: '2026-09-01',
            status: RoundStatus.Open,
        },
        overrides,
    );
}

export function violationRow(overrides: FakeRow = {}): FakeRow {
    return stamped(
        VIDEO_IDS.violation,
        {
            account_id: VIDEO_IDS.account,
            cost_cents: -12_000,
            decision_id: VIDEO_IDS.decision,
            kind: RuleViolationKind.ForcedRecovery,
            note: null,
            occurred_on: '2026-09-21',
            source: ViolationSource.Manual,
        },
        overrides,
    );
}

function stamped(id: string, row: FakeRow, overrides: FakeRow): FakeRow {
    return {
        created_at: CREATED_AT,
        id,
        updated_at: CREATED_AT,
        user_id: OWNER,
        ...row,
        ...overrides,
    };
}
