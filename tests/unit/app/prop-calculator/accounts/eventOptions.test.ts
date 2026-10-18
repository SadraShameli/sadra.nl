import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type EventDraft,
    eventOptions,
    type EventPreview,
    type EventPreviewer,
    NO_EVENT_PREVIEW,
    RECORDABLE_EVENT_KINDS,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/eventOptions';
import { accountEventKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    AccountEventKind,
    type AccountLifecycleState,
    AccountStage,
    AccountStatus,
    applyLifecycleEvent,
    compareText,
    LifecycleOutcomeKind,
    type PlanLifecycleFacts,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';
import { eventRecordSchema } from '~/lib/schemas/propAccounts';

const ACCOUNT_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

const ALL_STATES: readonly AccountLifecycleState[] = Object.values(
    AccountStage,
).flatMap((stage) =>
    Object.values(AccountStatus).map((status) => ({ stage, status })),
);

const FACTS: readonly PlanLifecycleFacts[] = [
    { fundedReset: null, isInstantFunded: false },
    { fundedReset: null, isInstantFunded: true },
    ...ALL_PLANS,
];

function acceptedKinds(
    facts: PlanLifecycleFacts,
    state: AccountLifecycleState,
): AccountEventKind[] {
    return Object.values(AccountEventKind).filter(
        (kind) =>
            applyLifecycleEvent(facts, state, kind).kind ===
            LifecycleOutcomeKind.Accepted,
    );
}

function isNoteRequiredBySchema(kind: AccountEventKind): boolean {
    return !eventRecordSchema.safeParse({
        accountId: ACCOUNT_ID,
        kind,
        note: null,
        occurredOn: '2026-09-01',
    }).success;
}

describe('RECORDABLE_EVENT_KINDS', () => {
    it('is every event kind the record schema accepts, never Edited or Purchased', () => {
        const accepted = Object.values(AccountEventKind).filter(
            (kind) =>
                eventRecordSchema.safeParse({
                    accountId: ACCOUNT_ID,
                    kind,
                    note: 'why',
                    occurredOn: '2026-09-01',
                }).success,
        );
        expect([...RECORDABLE_EVENT_KINDS].toSorted(compareText)).toEqual(
            accepted.toSorted(compareText),
        );
        expect(RECORDABLE_EVENT_KINDS).not.toContain(AccountEventKind.Edited);
        expect(RECORDABLE_EVENT_KINDS).not.toContain(
            AccountEventKind.Purchased,
        );
    });
});

describe('eventOptions', () => {
    it('offers exactly the recordable kinds the lifecycle accepts for the stored account, for every plan and state', () => {
        for (const facts of FACTS) {
            for (const state of ALL_STATES) {
                const expected = acceptedKinds(facts, state).filter(
                    (kind) =>
                        kind !== AccountEventKind.Edited &&
                        kind !== AccountEventKind.Purchased,
                );
                expect(
                    eventOptions(facts, state)
                        .map((option) => option.kind)
                        .toSorted(compareText),
                ).toEqual(expected.toSorted(compareText));
            }
        }
    });

    it('never offers Edited or Purchased', () => {
        for (const facts of FACTS) {
            for (const state of ALL_STATES) {
                const kinds = eventOptions(facts, state).map(
                    (option) => option.kind,
                );
                expect(kinds).not.toContain(AccountEventKind.Edited);
                expect(kinds).not.toContain(AccountEventKind.Purchased);
            }
        }
    });

    it('never offers an eval pass on an instant-funded plan', () => {
        const instant = FACTS.filter((facts) => facts.isInstantFunded);
        expect(instant.length).toBeGreaterThan(1);
        for (const facts of instant) {
            for (const state of ALL_STATES) {
                expect(
                    eventOptions(facts, state).map((option) => option.kind),
                ).not.toContain(AccountEventKind.EvalPassed);
            }
        }
    });

    it('offers an eval pass on an active evaluation of a plan with an evaluation', () => {
        const kinds = eventOptions(
            { fundedReset: null, isInstantFunded: false },
            { stage: AccountStage.Eval, status: AccountStatus.Active },
        ).map((option) => option.kind);
        expect(kinds).toContain(AccountEventKind.EvalPassed);
        expect(kinds).toContain(AccountEventKind.Busted);
    });

    it('requires a note exactly where the record schema does, which is a bust reversal', () => {
        const busted = eventOptions(
            { fundedReset: null, isInstantFunded: false },
            { stage: AccountStage.Funded, status: AccountStatus.Busted },
        );
        const reversal = busted.find(
            (option) => option.kind === AccountEventKind.BustReversed,
        );
        expect(reversal?.requiresNote).toBe(true);
        for (const facts of FACTS) {
            for (const state of ALL_STATES) {
                for (const option of eventOptions(facts, state)) {
                    expect(option.requiresNote, option.kind).toBe(
                        isNoteRequiredBySchema(option.kind),
                    );
                }
            }
        }
    });

    it('labels each option with the shared event kind label', () => {
        const options = eventOptions(
            { fundedReset: null, isInstantFunded: false },
            { stage: AccountStage.Eval, status: AccountStatus.Active },
        );
        for (const option of options) {
            expect(option.label).toBe(accountEventKindLabel(option.kind));
        }
    });

    it('offers nothing for an evaluation stored on an instant-funded plan', () => {
        expect(
            eventOptions(
                { fundedReset: null, isInstantFunded: true },
                { stage: AccountStage.Eval, status: AccountStatus.Active },
            ),
        ).toEqual([]);
    });
});

describe('the pre-submit preview slot', () => {
    it('is typed as a draft in, an optional preview out', () => {
        expectTypeOf<EventPreviewer>().parameter(0).toEqualTypeOf<EventDraft>();
        expectTypeOf<EventPreviewer>().returns.toEqualTypeOf<EventPreview | null>();
    });

    it('shows no preview by default', () => {
        expect(
            NO_EVENT_PREVIEW({
                accountId: ACCOUNT_ID,
                kind: AccountEventKind.MovedLive,
                note: null,
                occurredOn: '2026-09-01',
            }),
        ).toBeNull();
    });
});
