import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestGroupOf,
    overviewRequestKey,
    type OverviewResult,
    type OverviewWorkerResult,
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

export interface GroupDelivery {
    readonly delivered: null | OverviewWorkerResult;
    readonly failure: null | string;
}

export interface SlotEngine {
    readonly failure: null | string;
    readonly groupFailures?: GroupFailures;
    readonly outcomes: ReadonlyMap<string, OverviewOutcome>;
}

type GroupFailures = Readonly<Record<OverviewRequestGroup, null | string>>;

const HEADLINE_FAILURE_ORDER: readonly OverviewRequestGroup[] = [
    OverviewRequestGroup.Accounts,
    OverviewRequestGroup.Policy,
    OverviewRequestGroup.Projection,
    OverviewRequestGroup.Values,
];

const DELIVERY_ORDER: readonly OverviewRequestGroup[] = [
    OverviewRequestGroup.Policy,
    OverviewRequestGroup.Projection,
    OverviewRequestGroup.Values,
    OverviewRequestGroup.Accounts,
];

const WRONG_RESULT_KIND =
    'The engine answered with a result of the wrong kind.';

export function engineSlotOf<Figures>(
    engine: SlotEngine,
    request: OverviewRequest | undefined,
    figuresOf: (result: OverviewResult) => Figures | null,
): EngineSlot<Figures> {
    if (request === undefined) return { kind: EngineSlotKind.Pending };
    const outcome = engine.outcomes.get(overviewRequestKey(request));
    if (outcome === undefined) {
        const failure = groupFailureOf(engine, overviewRequestGroupOf(request));
        return failure === null
            ? { kind: EngineSlotKind.Pending }
            : { kind: EngineSlotKind.Failed, reason: failure };
    }
    if (outcome.kind === OverviewOutcomeKind.Failed) {
        return { kind: EngineSlotKind.Refused, reason: outcome.reason };
    }
    const figures = figuresOf(outcome.result);
    return figures === null
        ? { kind: EngineSlotKind.Failed, reason: WRONG_RESULT_KIND }
        : { figures, kind: EngineSlotKind.Ready };
}

export function groupFailureOf(
    engine: SlotEngine,
    group: OverviewRequestGroup,
): null | string {
    return engine.groupFailures === undefined
        ? engine.failure
        : engine.groupFailures[group];
}

export function slotEngineFromGroups(
    groups: Readonly<Record<OverviewRequestGroup, GroupDelivery>>,
): Required<SlotEngine> {
    const delivered = DELIVERY_ORDER.flatMap(
        (group) => groups[group].delivered?.outcomes ?? [],
    );
    return {
        failure:
            HEADLINE_FAILURE_ORDER.map((group) => groups[group].failure).find(
                (failure) => failure !== null,
            ) ?? null,
        groupFailures: {
            [OverviewRequestGroup.Accounts]:
                groups[OverviewRequestGroup.Accounts].failure,
            [OverviewRequestGroup.Policy]:
                groups[OverviewRequestGroup.Policy].failure,
            [OverviewRequestGroup.Projection]:
                groups[OverviewRequestGroup.Projection].failure,
            [OverviewRequestGroup.Values]:
                groups[OverviewRequestGroup.Values].failure,
        },
        outcomes: new Map(delivered.map((outcome) => [outcome.key, outcome])),
    };
}

export function uniformSlotEngine(
    failure: null | string,
): Required<SlotEngine> {
    return {
        failure,
        groupFailures: {
            [OverviewRequestGroup.Accounts]: failure,
            [OverviewRequestGroup.Policy]: failure,
            [OverviewRequestGroup.Projection]: failure,
            [OverviewRequestGroup.Values]: failure,
        },
        outcomes: new Map(),
    };
}
