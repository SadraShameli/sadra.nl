import { z } from 'zod';

import {
    EntryTextKind,
    parseMoneyText,
    RuleViolationKind,
    type UsdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';
import { violationCreateSchema } from '~/lib/schemas/propAccounts';

import { nullIfBlank, parsedOrIssues } from './formParsing';

export const NO_LINKED_DECISION = 'none';

const violationFormShape = z.object({
    costCents: z.string(),
    decisionId: z.string(),
    kind: z.enum(RuleViolationKind),
    note: z.string(),
    occurredOn: z.string(),
});

export interface StoredViolationValues {
    readonly costCents: null | UsdCents;
    readonly decisionId: null | string;
    readonly kind: RuleViolationKind;
    readonly note: null | string;
    readonly occurredOn: string;
}

export type ViolationFormValues = z.input<typeof violationFormShape>;

export function emptyViolationFormValues(
    occurredOn: string,
): ViolationFormValues {
    return {
        costCents: '',
        decisionId: NO_LINKED_DECISION,
        kind: RuleViolationKind.Other,
        note: '',
        occurredOn,
    };
}

export function violationEditFormValues(
    violation: StoredViolationValues,
): ViolationFormValues {
    return {
        costCents:
            violation.costCents === null
                ? ''
                : usdCentsToText(violation.costCents),
        decisionId: violation.decisionId ?? NO_LINKED_DECISION,
        kind: violation.kind,
        note: violation.note ?? '',
        occurredOn: violation.occurredOn,
    };
}

export function violationFormSchema(accountId: string) {
    return violationFormShape.transform((values, context) => {
        const cost = parseMoneyText(values.costCents);
        if (cost.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: cost.message,
                path: ['costCents'],
            });
            return z.NEVER;
        }
        const parsed = violationCreateSchema.safeParse({
            accountId,
            costCents: cost.kind === EntryTextKind.Valid ? cost.cents : null,
            decisionId:
                values.decisionId === NO_LINKED_DECISION
                    ? null
                    : values.decisionId,
            kind: values.kind,
            note: nullIfBlank(values.note),
            occurredOn: values.occurredOn,
        });
        return parsedOrIssues(parsed, context);
    });
}
