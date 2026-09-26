import { z } from 'zod';

import { AccountStage } from './AccountStage';

export enum AccountEventKind {
    Busted = 'busted',
    BustReversed = 'bust-reversed',
    Closed = 'closed',
    ClosedInactivity = 'closed-inactivity',
    Concluded = 'concluded',
    Edited = 'edited',
    EvalPassed = 'eval-passed',
    FundedReset = 'funded-reset',
    MovedLive = 'moved-live',
    Purchased = 'purchased',
    Refunded = 'refunded',
    Reopened = 'reopened',
    Resumed = 'resumed',
    Suspended = 'suspended',
}

export interface AccountEventChange {
    readonly field: string;
    readonly from: AccountEventChangeValue;
    readonly to: AccountEventChangeValue;
}

export type AccountEventChangeValue = boolean | null | number | string;

export interface AccountEventDetail {
    readonly changes: readonly AccountEventChange[];
    readonly note: null | string;
}

export const MAX_EVENT_NOTE_LENGTH = 500;
export const MAX_EVENT_CHANGES = 50;
export const MAX_EVENT_FIELD_LENGTH = 64;
export const MAX_EVENT_VALUE_LENGTH = 2000;

const changeValueSchema = z.union([
    z.boolean(),
    z.null(),
    z.number(),
    z.string().max(MAX_EVENT_VALUE_LENGTH),
]);

const changeSchema = z.object({
    field: z.string().min(1).max(MAX_EVENT_FIELD_LENGTH),
    from: changeValueSchema,
    to: changeValueSchema,
});

export const accountEventDetailSchema = z.object({
    changes: z
        .array(changeSchema)
        .max(MAX_EVENT_CHANGES)
        .readonly()
        .default([]),
    note: z.string().max(MAX_EVENT_NOTE_LENGTH).nullable().default(null),
}) satisfies z.ZodType<AccountEventDetail>;

export interface ImpliedEvalPass {
    readonly dateKnown: boolean;
    readonly on: string;
}

export function impliedEvalPassOn(
    account: {
        readonly fundedOn: null | string;
        readonly purchasedOn: string;
        readonly stage: AccountStage;
    },
    facts: { readonly isInstantFunded: boolean },
    hasRecordedPass: boolean,
): ImpliedEvalPass | null {
    if (
        hasRecordedPass ||
        account.stage === AccountStage.Eval ||
        facts.isInstantFunded
    ) {
        return null;
    }
    return account.fundedOn === null
        ? { dateKnown: false, on: account.purchasedOn }
        : { dateKnown: true, on: account.fundedOn };
}
