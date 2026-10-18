import { type z } from 'zod';

import { accountEventKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type AccountLifecycleState,
    applyLifecycleEvent,
    LifecycleOutcomeKind,
    type PlanLifecycleFacts,
} from '~/lib/prop-accounts';
import {
    eventRecordSchema,
    requiresEventNote,
} from '~/lib/schemas/propAccounts';

export interface EventDraft {
    readonly accountId: string;
    readonly kind: RecordableEventKind;
    readonly note: null | string;
    readonly occurredOn: string;
}

export interface EventOption {
    readonly kind: RecordableEventKind;
    readonly label: string;
    readonly requiresNote: boolean;
}

export interface EventPreview {
    readonly lines: readonly string[];
    readonly requiresConfirmation: boolean;
    readonly title: string;
}

export type EventPreviewer = (draft: EventDraft) => EventPreview | null;

export type RecordableEventKind = z.output<typeof eventRecordSchema>['kind'];

export const NO_EVENT_PREVIEW: EventPreviewer = () => null;

export const RECORDABLE_EVENT_KINDS: readonly RecordableEventKind[] =
    eventRecordSchema.shape.kind.options;

export function eventOptions(
    facts: PlanLifecycleFacts,
    state: AccountLifecycleState,
): readonly EventOption[] {
    return RECORDABLE_EVENT_KINDS.filter(
        (kind) =>
            applyLifecycleEvent(facts, state, kind).kind ===
            LifecycleOutcomeKind.Accepted,
    ).map((kind) => ({
        kind,
        label: accountEventKindLabel(kind),
        requiresNote: requiresEventNote(kind),
    }));
}
