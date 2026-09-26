import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    type AccountLifecycleState,
    AccountStage,
    AccountStatus,
    applyLifecycleEvent,
    describeLifecycleRejection,
    type LifecycleOutcome,
    LifecycleOutcomeKind,
    LifecycleRejection,
    type PlanLifecycleFacts,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';

const PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

function accepted(
    stage: AccountStage,
    status: AccountStatus,
): LifecycleOutcome {
    return { kind: LifecycleOutcomeKind.Accepted, state: state(stage, status) };
}

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function registryPlan(isMatch: (plan: Plan) => boolean): Plan {
    const plan = PLANS.find(isMatch);
    if (plan === undefined) throw new Error('no registry plan matches');
    return plan;
}

function rejected(reason: LifecycleRejection): LifecycleOutcome {
    return { kind: LifecycleOutcomeKind.Rejected, reason };
}

function state(
    stage: AccountStage,
    status: AccountStatus,
): AccountLifecycleState {
    return { stage, status };
}

const EVAL_PLAN = registryPlan(
    (p) => !p.isInstantFunded && p.fundedReset === null,
);
const INSTANT_PLAN = registryPlan((p) => p.isInstantFunded);
const RESET_PLAN = registryPlan(
    (p) => !p.isInstantFunded && p.fundedReset !== null,
);

const { Eval, Funded, Live } = AccountStage;
const { Active, Busted, Closed, Concluded, Suspended } = AccountStatus;

const CASES: readonly [
    string,
    PlanLifecycleFacts,
    AccountLifecycleState | null,
    AccountEventKind,
    LifecycleOutcome,
][] = [
    [
        'Purchased opens an eval',
        EVAL_PLAN,
        null,
        AccountEventKind.Purchased,
        accepted(Eval, Active),
    ],
    [
        'Purchased on an instant-funded plan opens funded',
        INSTANT_PLAN,
        null,
        AccountEventKind.Purchased,
        accepted(Funded, Active),
    ],
    [
        'Purchased on an open account is rejected',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.Purchased,
        rejected(LifecycleRejection.AccountAlreadyOpen),
    ],
    [
        'any other event before Purchased is rejected',
        EVAL_PLAN,
        null,
        AccountEventKind.EvalPassed,
        rejected(LifecycleRejection.AccountNotOpen),
    ],
    [
        'Edited before Purchased is rejected',
        EVAL_PLAN,
        null,
        AccountEventKind.Edited,
        rejected(LifecycleRejection.AccountNotOpen),
    ],
    [
        'EvalPassed from an active eval funds the account',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.EvalPassed,
        accepted(Funded, Active),
    ],
    [
        'EvalPassed from funded is rejected',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.EvalPassed,
        rejected(LifecycleRejection.NotEval),
    ],
    [
        'EvalPassed from live is rejected',
        EVAL_PLAN,
        state(Live, Active),
        AccountEventKind.EvalPassed,
        rejected(LifecycleRejection.NotEval),
    ],
    [
        'EvalPassed from a busted eval is rejected',
        EVAL_PLAN,
        state(Eval, Busted),
        AccountEventKind.EvalPassed,
        rejected(LifecycleRejection.NotActive),
    ],
    [
        'any event on an eval stage of an instant-funded plan is rejected',
        INSTANT_PLAN,
        state(Eval, Active),
        AccountEventKind.EvalPassed,
        rejected(LifecycleRejection.EvalOnInstantFundedPlan),
    ],
    [
        'Busted from an active eval',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.Busted,
        accepted(Eval, Busted),
    ],
    [
        'Busted from an active funded account',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.Busted,
        accepted(Funded, Busted),
    ],
    [
        'Busted from an active live account',
        EVAL_PLAN,
        state(Live, Active),
        AccountEventKind.Busted,
        accepted(Live, Busted),
    ],
    [
        'Busted twice is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Busted,
        rejected(LifecycleRejection.NotActive),
    ],
    [
        'Busted while suspended is rejected',
        EVAL_PLAN,
        state(Funded, Suspended),
        AccountEventKind.Busted,
        rejected(LifecycleRejection.NotActive),
    ],
    [
        'FundedReset from funded busted reactivates',
        RESET_PLAN,
        state(Funded, Busted),
        AccountEventKind.FundedReset,
        accepted(Funded, Active),
    ],
    [
        'FundedReset on a plan without a funded reset is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.FundedReset,
        rejected(LifecycleRejection.FundedResetNotOffered),
    ],
    [
        'FundedReset from an active funded account is rejected',
        RESET_PLAN,
        state(Funded, Active),
        AccountEventKind.FundedReset,
        rejected(LifecycleRejection.NotBusted),
    ],
    [
        'FundedReset from a busted eval is rejected',
        RESET_PLAN,
        state(Eval, Busted),
        AccountEventKind.FundedReset,
        rejected(LifecycleRejection.NotFunded),
    ],
    [
        'MovedLive from active funded',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.MovedLive,
        accepted(Live, Active),
    ],
    [
        'MovedLive from an eval is rejected',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.MovedLive,
        rejected(LifecycleRejection.NotFunded),
    ],
    [
        'MovedLive from a busted funded account is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.MovedLive,
        rejected(LifecycleRejection.NotActive),
    ],
    [
        'MovedLive from live is rejected',
        EVAL_PLAN,
        state(Live, Active),
        AccountEventKind.MovedLive,
        rejected(LifecycleRejection.NotFunded),
    ],
    [
        'Suspended from active',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.Suspended,
        accepted(Funded, Suspended),
    ],
    [
        'Suspended from busted is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Suspended,
        rejected(LifecycleRejection.NotActive),
    ],
    [
        'Resumed from suspended',
        EVAL_PLAN,
        state(Funded, Suspended),
        AccountEventKind.Resumed,
        accepted(Funded, Active),
    ],
    [
        'Resumed from active is rejected',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.Resumed,
        rejected(LifecycleRejection.NotSuspended),
    ],
    [
        'Concluded ends a funded account',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.Concluded,
        accepted(Funded, Concluded),
    ],
    [
        'Concluded ends a live account',
        EVAL_PLAN,
        state(Live, Active),
        AccountEventKind.Concluded,
        accepted(Live, Concluded),
    ],
    [
        'Concluded on a busted funded account is rejected: the bust stays visible',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Concluded,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'Concluded on a busted funded account with a funded reset is rejected',
        RESET_PLAN,
        state(Funded, Busted),
        AccountEventKind.Concluded,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'Concluded on a busted live account is rejected',
        RESET_PLAN,
        state(Live, Busted),
        AccountEventKind.Concluded,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'Concluded on an eval is rejected',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.Concluded,
        rejected(LifecycleRejection.EvalCannotConclude),
    ],
    [
        'Closed ends an active account',
        EVAL_PLAN,
        state(Eval, Active),
        AccountEventKind.Closed,
        accepted(Eval, Closed),
    ],
    [
        'Closed ends a busted eval',
        EVAL_PLAN,
        state(Eval, Busted),
        AccountEventKind.Closed,
        accepted(Eval, Closed),
    ],
    [
        'Closed on a busted funded account is rejected: it stays busted',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Closed,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'Closed on a busted funded account with a funded reset is rejected',
        RESET_PLAN,
        state(Funded, Busted),
        AccountEventKind.Closed,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'ClosedInactivity on a busted live account is rejected',
        RESET_PLAN,
        state(Live, Busted),
        AccountEventKind.ClosedInactivity,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'Refunded on a busted funded account is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Refunded,
        rejected(LifecycleRejection.BustedAccountStaysBusted),
    ],
    [
        'BustReversed takes a busted funded account back to active without a funded reset',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.BustReversed,
        accepted(Funded, Active),
    ],
    [
        'BustReversed on a plan with a funded reset keeps the stage',
        RESET_PLAN,
        state(Funded, Busted),
        AccountEventKind.BustReversed,
        accepted(Funded, Active),
    ],
    [
        'BustReversed takes a busted live account back to active',
        RESET_PLAN,
        state(Live, Busted),
        AccountEventKind.BustReversed,
        accepted(Live, Active),
    ],
    [
        'BustReversed takes a busted eval back to active',
        EVAL_PLAN,
        state(Eval, Busted),
        AccountEventKind.BustReversed,
        accepted(Eval, Active),
    ],
    [
        'BustReversed on an active account is rejected',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.BustReversed,
        rejected(LifecycleRejection.NotBusted),
    ],
    [
        'BustReversed on a closed account is rejected',
        EVAL_PLAN,
        state(Funded, Closed),
        AccountEventKind.BustReversed,
        rejected(LifecycleRejection.NotBusted),
    ],
    [
        'Closed ends a suspended account',
        EVAL_PLAN,
        state(Funded, Suspended),
        AccountEventKind.Closed,
        accepted(Funded, Closed),
    ],
    [
        'ClosedInactivity ends an account',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.ClosedInactivity,
        accepted(Funded, Closed),
    ],
    [
        'Refunded ends an account',
        EVAL_PLAN,
        state(Eval, Busted),
        AccountEventKind.Refunded,
        accepted(Eval, Closed),
    ],
    [
        'Closed on a closed account is rejected',
        EVAL_PLAN,
        state(Funded, Closed),
        AccountEventKind.Closed,
        rejected(LifecycleRejection.AlreadyEnded),
    ],
    [
        'Refunded on a concluded account is rejected',
        EVAL_PLAN,
        state(Funded, Concluded),
        AccountEventKind.Refunded,
        rejected(LifecycleRejection.AlreadyEnded),
    ],
    [
        'Concluded on a closed account is rejected',
        EVAL_PLAN,
        state(Funded, Closed),
        AccountEventKind.Concluded,
        rejected(LifecycleRejection.AlreadyEnded),
    ],
    [
        'Reopened from closed',
        EVAL_PLAN,
        state(Funded, Closed),
        AccountEventKind.Reopened,
        accepted(Funded, Active),
    ],
    [
        'Reopened from busted',
        EVAL_PLAN,
        state(Eval, Busted),
        AccountEventKind.Reopened,
        accepted(Eval, Active),
    ],
    [
        'Reopened from a busted funded account on a plan with a funded reset is rejected',
        RESET_PLAN,
        state(Funded, Busted),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.UseFundedReset),
    ],
    [
        'Reopened from a busted funded account on a plan without a funded reset is rejected',
        EVAL_PLAN,
        state(Funded, Busted),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.FundedResetNotOffered),
    ],
    [
        'Reopened from a busted funded account on an instant-funded plan without a reset is rejected',
        registryPlan((p) => p.isInstantFunded && p.fundedReset === null),
        state(Funded, Busted),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.FundedResetNotOffered),
    ],
    [
        'Reopened from a busted live account is rejected',
        RESET_PLAN,
        state(Live, Busted),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.LiveBustIsFinal),
    ],
    [
        'Reopened from a closed live account',
        EVAL_PLAN,
        state(Live, Closed),
        AccountEventKind.Reopened,
        accepted(Live, Active),
    ],
    [
        'Reopened from concluded is rejected',
        EVAL_PLAN,
        state(Funded, Concluded),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.NotReopenable),
    ],
    [
        'Reopened from active is rejected',
        EVAL_PLAN,
        state(Funded, Active),
        AccountEventKind.Reopened,
        rejected(LifecycleRejection.NotReopenable),
    ],
];

describe('applyLifecycleEvent', () => {
    it.each(CASES)('%s', (_label, facts, current, event, expected) => {
        expect(applyLifecycleEvent(facts, current, event)).toEqual(expected);
    });

    it('Edited never changes stage or status', () => {
        for (const stage of Object.values(AccountStage)) {
            for (const status of Object.values(AccountStatus)) {
                const facts = stage === Eval ? EVAL_PLAN : INSTANT_PLAN;
                expect(
                    applyLifecycleEvent(
                        facts,
                        state(stage, status),
                        AccountEventKind.Edited,
                    ),
                ).toEqual(accepted(stage, status));
            }
        }
    });

    it('covers every event kind in the table', () => {
        const covered = new Set(CASES.map((row) => row[3]));
        covered.add(AccountEventKind.Edited);
        expect([...covered].toSorted(byName)).toEqual(
            Object.values(AccountEventKind).toSorted(byName),
        );
    });

    it('does not mutate the input state', () => {
        const current = Object.freeze(state(Eval, Active));
        applyLifecycleEvent(EVAL_PLAN, current, AccountEventKind.EvalPassed);
        expect(current).toEqual(state(Eval, Active));
    });
});

interface BustWalk {
    readonly checked: number;
    readonly violations: readonly string[];
}

const BUST_CLEARING_EVENTS: Readonly<
    Record<AccountStage, ReadonlySet<AccountEventKind>>
> = {
    [Eval]: new Set(Object.values(AccountEventKind)),
    [Funded]: new Set([
        AccountEventKind.BustReversed,
        AccountEventKind.FundedReset,
    ]),
    [Live]: new Set([AccountEventKind.BustReversed]),
};

function eventSequences(maxLength: number): AccountEventKind[][] {
    const events = Object.values(AccountEventKind);
    const sequences: AccountEventKind[][] = [];
    let frontier: AccountEventKind[][] = [[]];
    for (let length = 1; length <= maxLength; length += 1) {
        frontier = frontier.flatMap((prefix) =>
            events.map((event) => [...prefix, event]),
        );
        sequences.push(...frontier);
    }
    return sequences;
}

function isBustLostWithoutClearing(
    facts: PlanLifecycleFacts,
    start: AccountLifecycleState,
    sequence: readonly AccountEventKind[],
): boolean {
    let current = start;
    let bustedStage: AccountStage | null =
        start.status === Busted ? start.stage : null;
    for (const event of sequence) {
        const outcome = applyLifecycleEvent(facts, current, event);
        if (outcome.kind === LifecycleOutcomeKind.Rejected) return false;
        if (
            bustedStage !== null &&
            BUST_CLEARING_EVENTS[bustedStage].has(event)
        ) {
            bustedStage = null;
        }
        current = outcome.state;
        if (bustedStage !== null && current.status !== Busted) return true;
        if (current.status === Busted) bustedStage = current.stage;
    }
    return false;
}

function walkForLostBusts(facts: PlanLifecycleFacts): BustWalk {
    const starts = Object.values(AccountStage).flatMap((stage) =>
        Object.values(AccountStatus).map((status) => state(stage, status)),
    );
    const sequences = eventSequences(3);
    const violations = starts.flatMap((start) =>
        sequences
            .filter((sequence) =>
                isBustLostWithoutClearing(facts, start, sequence),
            )
            .map(
                (sequence) =>
                    `${start.stage}/${start.status}: ${sequence.join(' > ')}`,
            ),
    );
    return { checked: starts.length * sequences.length, violations };
}

describe('bust revival and relabel', () => {
    it('never turns a busted funded or live account into any other status without a funded reset or a bust reversal, on a plan without a funded reset', () => {
        expect(EVAL_PLAN.fundedReset).toBeNull();
        const walk = walkForLostBusts(EVAL_PLAN);
        expect(walk.checked).toBeGreaterThan(40_000);
        expect(walk.violations).toEqual([]);
    });

    it('never turns a busted funded or live account into any other status without a funded reset or a bust reversal, on a plan with a funded reset', () => {
        expect(RESET_PLAN.fundedReset).not.toBeNull();
        const walk = walkForLostBusts(RESET_PLAN);
        expect(walk.checked).toBeGreaterThan(40_000);
        expect(walk.violations).toEqual([]);
    });

    it('closes the Busted, Closed, Reopened path at the close', () => {
        for (const stage of [Funded, Live]) {
            expect(
                applyLifecycleEvent(
                    RESET_PLAN,
                    state(stage, Busted),
                    AccountEventKind.Closed,
                ),
            ).toEqual(rejected(LifecycleRejection.BustedAccountStaysBusted));
        }
    });

    it('never relabels a funded or live bust as concluded', () => {
        for (const facts of [EVAL_PLAN, RESET_PLAN]) {
            for (const stage of [Funded, Live]) {
                expect(
                    applyLifecycleEvent(
                        facts,
                        state(stage, Busted),
                        AccountEventKind.Concluded,
                    ),
                ).toEqual(
                    rejected(LifecycleRejection.BustedAccountStaysBusted),
                );
            }
        }
    });

    it('still lets a funded reset bring a busted funded account back', () => {
        expect(
            applyLifecycleEvent(
                RESET_PLAN,
                state(Funded, Busted),
                AccountEventKind.FundedReset,
            ),
        ).toEqual(accepted(Funded, Active));
    });
});

describe('validateStageForPlan', () => {
    it('rejects Eval on an instant-funded plan with a typed reason', () => {
        expect(validateStageForPlan(Eval, INSTANT_PLAN)).toBe(
            LifecycleRejection.EvalOnInstantFundedPlan,
        );
    });

    it('accepts Funded and Live on an instant-funded plan', () => {
        expect(validateStageForPlan(Funded, INSTANT_PLAN)).toBeNull();
        expect(validateStageForPlan(Live, INSTANT_PLAN)).toBeNull();
    });

    it('accepts every stage on an eval plan', () => {
        for (const stage of Object.values(AccountStage)) {
            expect(validateStageForPlan(stage, EVAL_PLAN)).toBeNull();
        }
    });

    it('holds for every instant-funded plan in the registry', () => {
        const instant = PLANS.filter((p) => p.isInstantFunded);
        expect(instant.length).toBeGreaterThan(0);
        for (const plan of instant) {
            expect(validateStageForPlan(Eval, plan)).toBe(
                LifecycleRejection.EvalOnInstantFundedPlan,
            );
            expect(
                applyLifecycleEvent(plan, null, AccountEventKind.Purchased),
            ).toEqual(accepted(Funded, Active));
        }
    });
});

function stayBustedText(
    facts: PlanLifecycleFacts,
    stage: AccountStage,
): string {
    return describeLifecycleRejection(
        LifecycleRejection.BustedAccountStaysBusted,
        { facts, stage },
    );
}

describe('describeLifecycleRejection', () => {
    const CONTEXTS = [
        { facts: EVAL_PLAN, stage: null },
        ...[EVAL_PLAN, RESET_PLAN].flatMap((facts) =>
            Object.values(AccountStage).map((stage) => ({ facts, stage })),
        ),
    ];

    it('gives distinct plain text for every reason in every context', () => {
        for (const context of CONTEXTS) {
            const texts = Object.values(LifecycleRejection).map((reason) =>
                describeLifecycleRejection(reason, context),
            );
            for (const text of texts) {
                expect(text.length).toBeGreaterThan(0);
                expect(text).not.toContain('—');
            }
            expect(new Set(texts).size).toBe(texts.length);
        }
    });

    it('suggests a funded reset for a busted funded account whose plan offers one', () => {
        const text = stayBustedText(RESET_PLAN, Funded);
        expect(text).toContain('funded');
        expect(text).toContain('funded reset');
        expect(text).toContain('bust reversal');
    });

    it('never suggests a funded reset on a plan without one', () => {
        const text = stayBustedText(EVAL_PLAN, Funded);
        expect(text).toContain('funded');
        expect(text).not.toContain('funded reset');
        expect(text).toContain('bust reversal');
    });

    it('never suggests a funded reset on a live account, even on a plan with one', () => {
        for (const facts of [EVAL_PLAN, RESET_PLAN]) {
            const text = stayBustedText(facts, Live);
            expect(text).toContain('live');
            expect(text).not.toContain('funded reset');
            expect(text).toContain('bust reversal');
        }
    });
});
