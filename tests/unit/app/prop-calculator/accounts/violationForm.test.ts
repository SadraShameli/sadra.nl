import { describe, expect, it } from 'vitest';

import {
    emptyViolationFormValues,
    NO_LINKED_DECISION,
    violationEditFormValues,
    violationFormSchema,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/violationForm';
import { RuleViolationKind, usdCents } from '~/lib/prop-accounts';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const DECISION_ID = 'd2222222-2222-4222-8222-222222222222';

describe('emptyViolationFormValues', () => {
    it('defaults to no cost, no linked decision and the other kind', () => {
        expect(emptyViolationFormValues('2026-09-20')).toEqual({
            costCents: '',
            decisionId: NO_LINKED_DECISION,
            kind: RuleViolationKind.Other,
            note: '',
            occurredOn: '2026-09-20',
        });
    });
});

describe('violationEditFormValues', () => {
    it('round-trips a stored violation, showing a null cost as an empty field', () => {
        expect(
            violationEditFormValues({
                costCents: null,
                decisionId: null,
                kind: RuleViolationKind.ForcedRecovery,
                note: null,
                occurredOn: '2026-09-01',
            }),
        ).toEqual({
            costCents: '',
            decisionId: NO_LINKED_DECISION,
            kind: RuleViolationKind.ForcedRecovery,
            note: '',
            occurredOn: '2026-09-01',
        });
    });

    it('shows a stored cost, decision link and note', () => {
        expect(
            violationEditFormValues({
                costCents: usdCents(12_345),
                decisionId: DECISION_ID,
                kind: RuleViolationKind.Oversize,
                note: 'sized up after two losses',
                occurredOn: '2026-09-01',
            }),
        ).toEqual({
            costCents: '123.45',
            decisionId: DECISION_ID,
            kind: RuleViolationKind.Oversize,
            note: 'sized up after two losses',
            occurredOn: '2026-09-01',
        });
    });
});

describe('violationFormSchema', () => {
    it('parses a blank cost and no linked decision to null', () => {
        const schema = violationFormSchema(ACCOUNT_ID);
        const parsed = schema.safeParse({
            costCents: '',
            decisionId: NO_LINKED_DECISION,
            kind: RuleViolationKind.Other,
            note: '',
            occurredOn: '2026-09-01',
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data).toEqual({
            accountId: ACCOUNT_ID,
            costCents: null,
            decisionId: null,
            kind: RuleViolationKind.Other,
            note: null,
            occurredOn: '2026-09-01',
        });
    });

    it('parses a dollar cost and a linked decision', () => {
        const schema = violationFormSchema(ACCOUNT_ID);
        const parsed = schema.safeParse({
            costCents: '50.00',
            decisionId: DECISION_ID,
            kind: RuleViolationKind.WrongInstrument,
            note: 'traded NQ instead of MNQ',
            occurredOn: '2026-09-01',
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data).toEqual({
            accountId: ACCOUNT_ID,
            costCents: 5000,
            decisionId: DECISION_ID,
            kind: RuleViolationKind.WrongInstrument,
            note: 'traded NQ instead of MNQ',
            occurredOn: '2026-09-01',
        });
    });

    it('rejects an unparseable cost', () => {
        const schema = violationFormSchema(ACCOUNT_ID);
        const parsed = schema.safeParse({
            costCents: 'not a number',
            decisionId: NO_LINKED_DECISION,
            kind: RuleViolationKind.Other,
            note: '',
            occurredOn: '2026-09-01',
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects a date outside the schema supported year range', () => {
        const schema = violationFormSchema(ACCOUNT_ID);
        const parsed = schema.safeParse({
            costCents: '',
            decisionId: NO_LINKED_DECISION,
            kind: RuleViolationKind.Other,
            note: '',
            occurredOn: '2999-01-01',
        });
        expect(parsed.success).toBe(false);
    });
});
