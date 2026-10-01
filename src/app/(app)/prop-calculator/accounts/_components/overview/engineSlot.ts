import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
    type OverviewResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

export enum EngineSlotKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
    Refused = 'refused',
}

export type EngineSlot<Figures> =
    | { readonly figures: Figures; readonly kind: EngineSlotKind.Ready }
    | {
          readonly kind: EngineSlotKind.Failed | EngineSlotKind.Refused;
          readonly reason: string;
      }
    | { readonly kind: EngineSlotKind.Pending };

export interface SlotEngine {
    readonly failure: null | string;
    readonly outcomes: ReadonlyMap<string, OverviewOutcome>;
}

const WRONG_RESULT_KIND = 'The engine answered with a result of the wrong kind.';

export function engineSlotOf<Figures>(
    engine: SlotEngine,
    request: OverviewRequest | undefined,
    figuresOf: (result: OverviewResult) => Figures | null,
): EngineSlot<Figures> {
    if (request === undefined) return { kind: EngineSlotKind.Pending };
    const outcome = engine.outcomes.get(overviewRequestKey(request));
    if (outcome === undefined) {
        return engine.failure === null
            ? { kind: EngineSlotKind.Pending }
            : { kind: EngineSlotKind.Failed, reason: engine.failure };
    }
    if (outcome.kind === OverviewOutcomeKind.Failed) {
        return { kind: EngineSlotKind.Refused, reason: outcome.reason };
    }
    const figures = figuresOf(outcome.result);
    return figures === null
        ? { kind: EngineSlotKind.Failed, reason: WRONG_RESULT_KIND }
        : { figures, kind: EngineSlotKind.Ready };
}
