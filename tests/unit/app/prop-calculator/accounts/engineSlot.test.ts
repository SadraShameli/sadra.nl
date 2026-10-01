import { describe, expect, it } from 'vitest';

import {
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestGroupOf,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    overviewValueChainRequestsFor,
    type OverviewWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    EngineSlotKind,
    engineSlotOf,
    groupFailureOf,
    type SlotEngine,
    slotEngineFromGroups,
    uniformSlotEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import {
    FirmId,
    NO_PLAN_OPT_INS,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const PLAN_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const PLAN_INPUT = {
    firmId: FirmId.TopStep,
    measuredRebuyLag: null,
    optIns: NO_PLAN_OPT_INS,
    planSerial: PLAN_SERIAL,
};

function firstOf(requests: readonly OverviewRequest[]): OverviewRequest {
    const [first] = requests;
    if (first === undefined) throw new Error('no request');
    return first;
}

const DOCUMENTED = firstOf(
    overviewRequestsFor([PLAN_INPUT], DEFAULT_RULEBOOK).filter(
        (request) => request.kind === OverviewRequestKind.DocumentedRun,
    ),
);

const CHAIN = firstOf(
    overviewValueChainRequestsFor([PLAN_INPUT], DEFAULT_RULEBOOK),
);

const NO_FAILURES = {
    [OverviewRequestGroup.Accounts]: null,
    [OverviewRequestGroup.Policy]: null,
    [OverviewRequestGroup.Projection]: null,
    [OverviewRequestGroup.Values]: null,
};

function figuresOf(): DocumentedRunFigures | null {
    return null;
}

function refusedOutcome(request: OverviewRequest): OverviewOutcome {
    return {
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Failed,
        reason: 'the sizing is refused',
    };
}

function resultOfNothing(): OverviewWorkerResult {
    return { outcomes: [refusedOutcome(DOCUMENTED)] };
}

describe('overviewRequestGroupOf (PT-37b)', () => {
    it('is the group the worker task of the request runs in', () => {
        expect(overviewRequestGroupOf(DOCUMENTED)).toBe(
            OverviewRequestGroup.Policy,
        );
        expect(overviewRequestGroupOf(CHAIN)).toBe(OverviewRequestGroup.Values);
    });
});

describe('engineSlotOf with per-group failures (PT-37b)', () => {
    const valuesFailed: SlotEngine = {
        failure: 'values worker crashed',
        groupFailures: {
            ...NO_FAILURES,
            [OverviewRequestGroup.Values]: 'values worker crashed',
        },
        outcomes: new Map(),
    };

    it('leaves a request of another group pending when a group failed', () => {
        expect(engineSlotOf(valuesFailed, DOCUMENTED, figuresOf)).toEqual({
            kind: EngineSlotKind.Pending,
        });
    });

    it('fails a request of the group that failed, with that group failure', () => {
        expect(engineSlotOf(valuesFailed, CHAIN, figuresOf)).toEqual({
            kind: EngineSlotKind.Failed,
            reason: 'values worker crashed',
        });
    });

    it('gives each request its own group failure when several groups failed', () => {
        const engine: SlotEngine = {
            failure: 'policy worker crashed',
            groupFailures: {
                ...NO_FAILURES,
                [OverviewRequestGroup.Policy]: 'policy worker crashed',
                [OverviewRequestGroup.Values]: 'values worker crashed',
            },
            outcomes: new Map(),
        };
        expect(engineSlotOf(engine, DOCUMENTED, figuresOf)).toEqual({
            kind: EngineSlotKind.Failed,
            reason: 'policy worker crashed',
        });
        expect(engineSlotOf(engine, CHAIN, figuresOf)).toEqual({
            kind: EngineSlotKind.Failed,
            reason: 'values worker crashed',
        });
    });

    it('still reports a delivered outcome of a request whose group failed later', () => {
        const engine: SlotEngine = {
            ...valuesFailed,
            outcomes: new Map([
                [overviewRequestKey(CHAIN), refusedOutcome(CHAIN)],
            ]),
        };
        expect(engineSlotOf(engine, CHAIN, figuresOf)).toEqual({
            kind: EngineSlotKind.Refused,
            reason: 'the sizing is refused',
        });
    });

    it('applies the single failure to every group when the engine carries no group failures', () => {
        const engine: SlotEngine = {
            failure: 'Web workers are not available in this browser.',
            outcomes: new Map(),
        };
        for (const request of [DOCUMENTED, CHAIN]) {
            expect(engineSlotOf(engine, request, figuresOf)).toEqual({
                kind: EngineSlotKind.Failed,
                reason: 'Web workers are not available in this browser.',
            });
        }
    });

    it('stays pending with no failure at all', () => {
        expect(
            engineSlotOf(
                { failure: null, outcomes: new Map() },
                CHAIN,
                figuresOf,
            ),
        ).toEqual({ kind: EngineSlotKind.Pending });
    });
});

describe('groupFailureOf (PT-37b)', () => {
    it('reads the group failure, or the single failure when there are no group failures', () => {
        const grouped: SlotEngine = {
            failure: 'values worker crashed',
            groupFailures: {
                ...NO_FAILURES,
                [OverviewRequestGroup.Values]: 'values worker crashed',
            },
            outcomes: new Map(),
        };
        expect(groupFailureOf(grouped, OverviewRequestGroup.Values)).toBe(
            'values worker crashed',
        );
        expect(groupFailureOf(grouped, OverviewRequestGroup.Policy)).toBeNull();
        expect(
            groupFailureOf(
                { failure: 'one failure', outcomes: new Map() },
                OverviewRequestGroup.Policy,
            ),
        ).toBe('one failure');
    });
});

describe('slotEngineFromGroups (PT-37b)', () => {
    const nothing = { delivered: null, failure: null };

    it('keeps each group failure apart and delivers the outcomes of the groups that answered', () => {
        const engine = slotEngineFromGroups({
            [OverviewRequestGroup.Accounts]: nothing,
            [OverviewRequestGroup.Policy]: {
                delivered: resultOfNothing(),
                failure: null,
            },
            [OverviewRequestGroup.Projection]: nothing,
            [OverviewRequestGroup.Values]: {
                delivered: null,
                failure: 'values worker crashed',
            },
        });
        expect(engine.groupFailures).toEqual({
            ...NO_FAILURES,
            [OverviewRequestGroup.Values]: 'values worker crashed',
        });
        expect(engine.failure).toBe('values worker crashed');
        expect(engine.outcomes.keys().toArray()).toEqual([
            overviewRequestKey(DOCUMENTED),
        ]);
    });

    it('reports the first failure in the accounts, policy, projection, values order as the headline failure', () => {
        const engine = slotEngineFromGroups({
            [OverviewRequestGroup.Accounts]: nothing,
            [OverviewRequestGroup.Policy]: {
                delivered: null,
                failure: 'policy worker crashed',
            },
            [OverviewRequestGroup.Projection]: nothing,
            [OverviewRequestGroup.Values]: {
                delivered: null,
                failure: 'values worker crashed',
            },
        });
        expect(engine.failure).toBe('policy worker crashed');
    });

    it('has no failure and no outcomes when nothing ran', () => {
        const engine = slotEngineFromGroups({
            [OverviewRequestGroup.Accounts]: nothing,
            [OverviewRequestGroup.Policy]: nothing,
            [OverviewRequestGroup.Projection]: nothing,
            [OverviewRequestGroup.Values]: nothing,
        });
        expect(engine.failure).toBeNull();
        expect(engine.outcomes.size).toBe(0);
    });
});

describe('uniformSlotEngine (PT-37b)', () => {
    it('carries one failure in every group and as the headline', () => {
        const engine = uniformSlotEngine('Web workers are not available.');
        expect(engine.failure).toBe('Web workers are not available.');
        expect(engine.groupFailures).toEqual({
            [OverviewRequestGroup.Accounts]: 'Web workers are not available.',
            [OverviewRequestGroup.Policy]: 'Web workers are not available.',
            [OverviewRequestGroup.Projection]: 'Web workers are not available.',
            [OverviewRequestGroup.Values]: 'Web workers are not available.',
        });
        expect(engine.outcomes.size).toBe(0);
    });

    it('carries no failure in any group for null', () => {
        const engine = uniformSlotEngine(null);
        expect(engine.failure).toBeNull();
        expect(engine.groupFailures).toEqual(NO_FAILURES);
    });

    it('fails every request of every group with its single failure', () => {
        const engine = uniformSlotEngine('down');
        for (const request of [DOCUMENTED, CHAIN]) {
            expect(engineSlotOf(engine, request, figuresOf)).toEqual({
                kind: EngineSlotKind.Failed,
                reason: 'down',
            });
        }
    });
});
