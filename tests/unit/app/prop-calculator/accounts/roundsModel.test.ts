import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    firmColumnsFromSelectValue,
    firmSelectOptions,
    nextRoundCardModelOf,
    NextRoundRecommendation,
    nextRoundResultSummaryOf,
    roundsPageModel,
} from '~/app/(app)/prop-calculator/accounts/rounds/roundsModel';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    AccountEventKind,
    AccountStatus,
    AccountTracking,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    RoundStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import { findFirm, FirmId, fraction } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK, RebuyLagBasis } from '~/lib/prop-calculator/advisor';
import { type BankrollTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
    round,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const TODAY = '2026-09-26';

const THRESHOLDS = {
    minClosedRounds: null,
    minEndedAccounts: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

const HOLA = { id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', name: 'Hola Prime' };
const ATLAS = {
    id: '7c2d9e4f-3a1b-4c5d-8e6f-9a0b1c2d3e4f',
    name: 'Atlas Prop',
};

describe('firmSelectOptions', () => {
    it('lists every modeled firm and sorts external firms by name', () => {
        const options = firmSelectOptions([HOLA, ATLAS]);
        const evalFirm = findFirm(EVAL_PLAN.firm.id);
        if (evalFirm === undefined) throw new Error('no eval firm');
        expect(options).toContainEqual({
            label: evalFirm.displayName,
            value: firmKeyId({
                firmId: evalFirm.id,
                kind: FirmKeyKind.Modeled,
            }),
        });
        const ownValues = options.filter((option) =>
            option.value.startsWith(`${FirmKeyKind.External}:`),
        );
        expect(ownValues).toEqual([
            {
                label: ATLAS.name,
                value: firmKeyId({
                    externalFirmId: ATLAS.id,
                    kind: FirmKeyKind.External,
                }),
            },
            {
                label: HOLA.name,
                value: firmKeyId({
                    externalFirmId: HOLA.id,
                    kind: FirmKeyKind.External,
                }),
            },
        ]);
    });
});

describe('firmColumnsFromSelectValue', () => {
    it('round-trips a modeled firm value', () => {
        expect(
            firmColumnsFromSelectValue(
                firmKeyId({ firmId: FirmId.Apex, kind: FirmKeyKind.Modeled }),
            ),
        ).toEqual({ externalFirmId: null, firmId: FirmId.Apex });
    });

    it('round-trips an external firm value', () => {
        expect(
            firmColumnsFromSelectValue(
                firmKeyId({
                    externalFirmId: HOLA.id,
                    kind: FirmKeyKind.External,
                }),
            ),
        ).toEqual({ externalFirmId: HOLA.id, firmId: null });
    });

    it('returns null for a value with no separator or an unknown firm id', () => {
        expect(firmColumnsFromSelectValue('not-a-value')).toBeNull();
        expect(
            firmColumnsFromSelectValue('modeled:not-a-real-firm'),
        ).toBeNull();
    });
});

describe('roundsPageModel', () => {
    it('shows a round with its budget, status and member, sorted newest first', () => {
        const openRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Open,
            { budgetCents: usdCents(100_000) },
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: openRound.id,
        });
        const model = roundsPageModel(
            ledger({ accounts: [member], rounds: [openRound] }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.rounds).toHaveLength(1);
        const [row] = model.rounds;
        expect(row).toMatchObject({
            budgetText: '$0 of $1,000',
            firm: EVAL_PLAN.firm.displayName,
            label: 'Q1 push',
            openMemberCount: 1,
            status: RoundStatus.Open,
            statusLabel: 'Open',
        });
    });

    it('carries payouts, cycle days and the in-progress text on each round row', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Closed push',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-03-01' },
        );
        const openRound = round(
            EVAL_PLAN,
            'Open push',
            '2026-04-01',
            RoundStatus.Open,
        );
        const closedMember = account(EVAL_PLAN, {
            purchasedOn: '2026-01-05',
            roundId: closedRound.id,
        });
        const busted = account(EVAL_PLAN, {
            purchasedOn: '2026-04-01',
            roundId: openRound.id,
        });
        const stillOpen = account(EVAL_PLAN, {
            purchasedOn: '2026-04-01',
            roundId: openRound.id,
        });
        const model = roundsPageModel(
            ledger({
                accounts: [closedMember, busted, stillOpen],
                events: [
                    event(closedMember, AccountEventKind.Busted, '2026-02-20'),
                    event(busted, AccountEventKind.Purchased, '2026-04-01'),
                    event(busted, AccountEventKind.Busted, '2026-04-05'),
                    event(stillOpen, AccountEventKind.Purchased, '2026-04-01'),
                ],
                fees: [
                    fee(
                        closedMember,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-01-05',
                    ),
                ],
                payouts: [
                    payout(closedMember, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-02-15',
                    }),
                ],
                rounds: [closedRound, openRound],
            }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        const rowOf = (label: string) =>
            model.rounds.find((row) => row.label === label);
        expect(rowOf('Closed push')).toMatchObject({
            cycleDays: '41 days',
            inProgressText: 'none',
            payoutsCents: '$300',
        });
        expect(rowOf('Open push')).toMatchObject({
            cycleDays: NOT_APPLICABLE,
            inProgressText: '1 in progress',
            payoutsCents: '$0',
        });
    });

    it('states each firm spread with its rounds, multiples and the share positive with its interval and n', () => {
        const rounds = ['A', 'B', 'C'].map((name, index) =>
            round(
                EVAL_PLAN,
                `Round ${name}`,
                `2026-0${String(index + 1)}-01`,
                RoundStatus.Closed,
                { closedOn: `2026-0${String(index + 1)}-20` },
            ),
        );
        const members = rounds.map((r) =>
            account(EVAL_PLAN, { roundId: r.id }),
        );
        const payoutCents = [100_000, 25_000, 100_000];
        const model = roundsPageModel(
            ledger({
                accounts: members,
                fees: members.map((member, index) =>
                    fee(
                        member,
                        FeeKind.EvalPurchase,
                        50_000,
                        `2026-0${String(index + 1)}-01`,
                    ),
                ),
                payouts: members.map((member, index) =>
                    payout(member, payoutCents[index] ?? 0, {
                        netCents: payoutCents[index] ?? 0,
                        paidOn: `2026-0${String(index + 1)}-10`,
                    }),
                ),
                rounds,
            }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.perFirm).toHaveLength(1);
        expect(model.perFirm[0]).toMatchObject({
            closedRounds: '3',
            firm: EVAL_PLAN.firm.displayName,
            max: '2.00x',
            min: '0.50x',
            rounds: '3',
            sharePositive: '66.7% (95% CI 20.8% to 93.9%, n = 3)',
        });
    });

    it('states a firm spread from its closed rounds only and shows how many rounds that leaves out', () => {
        const closedWinner = round(
            EVAL_PLAN,
            'Closed winner',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-02-01' },
        );
        const openRounds = ['A', 'B'].map((name, index) =>
            round(
                EVAL_PLAN,
                `Open ${name}`,
                `2026-0${String(index + 3)}-01`,
                RoundStatus.Open,
            ),
        );
        const winnerMember = account(EVAL_PLAN, { roundId: closedWinner.id });
        const openMembers = openRounds.map((r) =>
            account(EVAL_PLAN, { roundId: r.id }),
        );
        const model = roundsPageModel(
            ledger({
                accounts: [winnerMember, ...openMembers],
                fees: [
                    fee(
                        winnerMember,
                        FeeKind.EvalPurchase,
                        50_000,
                        '2026-01-01',
                    ),
                    ...openMembers.map((member, index) =>
                        fee(
                            member,
                            FeeKind.EvalPurchase,
                            50_000,
                            `2026-0${String(index + 3)}-01`,
                        ),
                    ),
                ],
                payouts: [
                    payout(winnerMember, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                rounds: [closedWinner, ...openRounds],
            }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.perFirm[0]).toMatchObject({
            closedRounds: '1',
            max: '2.00x',
            mean: '2.00x',
            min: '2.00x',
            rounds: '3',
            sharePositive: '100.0% (95% CI 20.7% to 100.0%, n = 1)',
        });
    });

    it('counts a round without a firm in the unassigned count', () => {
        const unassigned = round(
            EVAL_PLAN,
            'Loose round',
            '2026-01-01',
            RoundStatus.Open,
            { externalFirmId: null, firmId: null },
        );
        const model = roundsPageModel(
            ledger({ rounds: [unassigned] }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.unassignedRoundCount).toBe(1);
        expect(model.perFirm).toEqual([]);
    });

    it("feeds the user's own realized outcomes into the modeled P(round net negative), instead of leaving it stuck at N/A", () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            { closedOn: '2026-07-01' },
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: closedRound.id,
            status: AccountStatus.Busted,
        });
        const model = roundsPageModel(
            ledger({
                accounts: [member],
                events: [event(member, AccountEventKind.Busted, '2026-06-15')],
                fees: [fee(member, FeeKind.EvalPurchase, 15_000, '2026-06-01')],
                rounds: [closedRound],
            }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        const [row] = model.rounds;
        if (row === undefined) throw new Error('expected the round to appear');
        expect(row.likeThisEndsNetNegativeModeled).toBe(
            '100.0% (bootstrap estimate over 1 attempt, 500 resamples)',
        );
        expect(row.likeThisEndsNetNegativeClosedForm).toBe('100.0%');
    });

    it('suggests a round for accounts purchased close together at the same firm and not yet in a round', () => {
        const first = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: null,
        });
        const second = account(EVAL_PLAN, {
            purchasedOn: '2026-06-05',
            roundId: null,
        });
        const otherFirm = account(OTHER_FIRM_EVAL_PLAN, {
            purchasedOn: '2026-06-02',
            roundId: null,
        });
        const model = roundsPageModel(
            ledger({ accounts: [first, second, otherFirm] }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.suggestions).toHaveLength(1);
        expect(model.suggestions[0]).toMatchObject({
            earliestPurchase: '2026-06-01',
            firm: EVAL_PLAN.firm.displayName,
            latestPurchase: '2026-06-05',
            memberCount: 2,
        });
    });

    it('does not suggest a round for a single ungrouped account', () => {
        const alone = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: null,
        });
        const model = roundsPageModel(
            ledger({ accounts: [alone] }),
            THRESHOLDS,
            14,
            [],
            TODAY,
        );
        expect(model.suggestions).toEqual([]);
    });
});

function measuredLagCard() {
    const closedRound = round(
        EVAL_PLAN,
        'Q1 push',
        '2026-06-01',
        RoundStatus.Closed,
        { closedOn: '2026-07-01' },
    );
    const replaced = account(EVAL_PLAN, {
        purchasedOn: '2026-05-04',
        status: AccountStatus.Busted,
    });
    const member = account(EVAL_PLAN, {
        purchasedOn: '2026-06-05',
        replacesAccountId: replaced.id,
        roundId: closedRound.id,
    });
    const model = nextRoundCardModelOf({
        availableCents: null,
        ledger: ledger({
            accounts: [replaced, member],
            events: [
                purchased(replaced),
                event(replaced, AccountEventKind.Busted, '2026-06-01'),
                purchased(member),
            ],
            rounds: [closedRound],
        }),
        rulebook: DEFAULT_RULEBOOK,
        runId: 1,
        today: TODAY,
        trades: 0,
    });
    if (model === null) throw new Error('expected a next-round card model');
    return model;
}

describe('nextRoundCardModelOf', () => {
    it('returns null when there is no closed round', () => {
        const openRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Open,
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: openRound.id,
        });
        const model = nextRoundCardModelOf({
            availableCents: null,
            ledger: ledger({ accounts: [member], rounds: [openRound] }),
            rulebook: DEFAULT_RULEBOOK,
            runId: 1,
            today: TODAY,
            trades: 0,
        });
        expect(model).toBeNull();
    });

    it('returns null when the closed round has no resolvable plan', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-07-01',
            },
        );
        const model = nextRoundCardModelOf({
            availableCents: null,
            ledger: ledger({ accounts: [], rounds: [closedRound] }),
            rulebook: DEFAULT_RULEBOOK,
            runId: 1,
            today: TODAY,
            trades: 0,
        });
        expect(model).toBeNull();
    });

    it('builds a next-round request from the closed round, with option B capped at the available bankroll', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-07-01',
            },
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: closedRound.id,
        });
        const model = nextRoundCardModelOf({
            availableCents: 20_000,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
                payouts: [payout(member, 30_000, { paidOn: '2026-06-25' })],
                rounds: [closedRound],
            }),
            rulebook: DEFAULT_RULEBOOK,
            runId: 7,
            today: TODAY,
            trades: 0,
        });
        if (model === null) throw new Error('expected a next-round card model');
        expect(model.roundId).toBe(closedRound.id);
        expect(model.request.runId).toBe(7);
        expect(model.request.optionA.startingBankroll).toBeCloseTo(100);
        expect(model.request.optionB.startingBankroll).toBeCloseTo(200);
        expect(model.request.variant.plan.firmId).toBe(EVAL_PLAN.firm.id);
        expect(model.request.variant.base.rrRatio).toBe(
            DEFAULT_RULEBOOK.strategy.rr,
        );
        expect(model.request.variant.base.winrate).toBe(
            DEFAULT_RULEBOOK.strategy.winrate,
        );
        expect(model.scaleGate.status).toBe(ScaleGateStatus.ThresholdsNotSet);
    });

    it(
        "caps option B at option A's budget when no available bankroll figure is known " +
            'yet, instead of leaving it uncapped',
        () => {
            const closedRound = round(
                EVAL_PLAN,
                'Q1 push',
                '2026-06-01',
                RoundStatus.Closed,
                { closedOn: '2026-07-01' },
            );
            const member = account(EVAL_PLAN, {
                purchasedOn: '2026-06-01',
                roundId: closedRound.id,
            });
            const model = nextRoundCardModelOf({
                availableCents: null,
                ledger: ledger({
                    accounts: [member],
                    fees: [
                        fee(member, FeeKind.EvalPurchase, 10_000, '2026-06-01'),
                    ],
                    payouts: [payout(member, 30_000, { paidOn: '2026-06-25' })],
                    rounds: [closedRound],
                }),
                rulebook: DEFAULT_RULEBOOK,
                runId: 1,
                today: TODAY,
                trades: 0,
            });
            if (model === null)
                throw new Error('expected a next-round card model');
            expect(model.request.optionA.startingBankroll).toBeCloseTo(100);
            expect(model.request.optionB.startingBankroll).toBeCloseTo(100);
        },
    );

    describe('the measured rebuy lag of the plan (PT-111, F-76 (2))', () => {
        it('prices the next round at the lag measured on the plan, not at the assumed zero', () => {
            const model = measuredLagCard();
            const { policy } = model.request.variant;
            expect(policy.rebuyLagDays).toBe(3);
            expect(policy.rebuyLagBasis).toBe(RebuyLagBasis.Measured);
            expect(model.rebuyLagNote).toContain('3.0 sessions');
            expect(model.rebuyLagNote).toContain(
                'measured from 1 of your replacements',
            );
        });

        it('keeps the assumed zero, and says so, when no replacement on the plan could be measured', () => {
            const closedRound = round(
                EVAL_PLAN,
                'Q1 push',
                '2026-06-01',
                RoundStatus.Closed,
                { closedOn: '2026-07-01' },
            );
            const member = account(EVAL_PLAN, {
                purchasedOn: '2026-06-01',
                roundId: closedRound.id,
            });
            const model = nextRoundCardModelOf({
                availableCents: null,
                ledger: ledger({ accounts: [member], rounds: [closedRound] }),
                rulebook: DEFAULT_RULEBOOK,
                runId: 1,
                today: TODAY,
                trades: 0,
            });
            if (model === null)
                throw new Error('expected a next-round card model');
            const { policy } = model.request.variant;
            expect(policy.rebuyLagDays).toBe(0);
            expect(policy.rebuyLagBasis).toBe(RebuyLagBasis.AssumedZero);
            expect(model.rebuyLagNote).toContain('assumed zero');
        });
    });

    it('returns null when the closed round mixes members on different plans', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-07-01',
            },
        );
        const memberA = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: closedRound.id,
        });
        const memberB = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            purchasedOn: '2026-06-02',
            roundId: closedRound.id,
        });
        const model = nextRoundCardModelOf({
            availableCents: null,
            ledger: ledger({
                accounts: [memberA, memberB],
                rounds: [closedRound],
            }),
            rulebook: DEFAULT_RULEBOOK,
            runId: 1,
            today: TODAY,
            trades: 0,
        });
        expect(model).toBeNull();
    });

    it("does not price a round's ledger-only member as the checked plan's, and names it as left out", () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-07-01',
            },
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: closedRound.id,
        });
        const ledgerOnlyMember = account(EVAL_PLAN, {
            label: 'My own tracked account',
            planLabel: 'My own tracked plan',
            planSerial: null,
            purchasedOn: '2026-06-03',
            roundId: closedRound.id,
            tracking: AccountTracking.LedgerOnly,
        });
        const model = nextRoundCardModelOf({
            availableCents: null,
            ledger: ledger({
                accounts: [member, ledgerOnlyMember],
                fees: [
                    fee(member, FeeKind.EvalPurchase, 10_000, '2026-06-01'),
                    fee(
                        ledgerOnlyMember,
                        FeeKind.EvalPurchase,
                        99_000,
                        '2026-06-03',
                    ),
                ],
                payouts: [payout(member, 30_000, { paidOn: '2026-06-25' })],
                rounds: [closedRound],
            }),
            rulebook: DEFAULT_RULEBOOK,
            runId: 1,
            today: TODAY,
            trades: 0,
        });
        if (model === null) throw new Error('expected a next-round card model');
        expect(model.request.optionA.startingBankroll).toBeCloseTo(100);
        expect(model.leftOutLabels).toEqual(['My own tracked account']);
    });

    it('uses the measured round cycle for the day budget once the sample of closed rounds is adequate', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Q1 push',
            '2026-06-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-07-01',
            },
        );
        const member = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            roundId: closedRound.id,
        });
        const model = nextRoundCardModelOf({
            availableCents: null,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
                payouts: [payout(member, 30_000, { paidOn: '2026-06-25' })],
                rounds: [closedRound],
            }),
            rulebook: {
                ...DEFAULT_RULEBOOK,
                samples: { ...DEFAULT_RULEBOOK.samples, minClosedRounds: 1 },
            },
            runId: 1,
            today: TODAY,
            trades: 0,
        });
        if (model === null) throw new Error('expected a next-round card model');
        expect(model.measuredCycleDays).toBe(24);
        expect(model.request.dayBudget).toBe(24);
    });
});

function bankrollTimelineResult(
    overrides: Partial<BankrollTimelineResult> = {},
): BankrollTimelineResult {
    return {
        cardsBoughtP50: 1,
        cashP10: [100, 100],
        cashP50: [100, 150],
        cashP90: [100, 200],
        cumulativeSpendP10: [0, 0],
        cumulativeSpendP50: [0, 0],
        cumulativeSpendP90: [0, 0],
        days: [0, 1],
        measuredCycleDays: null,
        pathRuin: fraction(0.1),
        payoutP10: [0, 0],
        payoutP50: [0, 0],
        payoutP90: [0, 0],
        pFinalNetNegative: fraction(0.2),
        withdrawnP10: [0, 0],
        withdrawnP50: [0, 0],
        withdrawnP90: [0, 0],
        ...overrides,
    };
}

describe('nextRoundResultSummaryOf', () => {
    it('marks option B "scale gate not met" when the gate has an unmet condition', () => {
        const summary = nextRoundResultSummaryOf({
            dayBudget: 60,
            optionABudget: 100,
            optionAResult: bankrollTimelineResult({ cashP50: [100, 100] }),
            optionBBudget: 300,
            optionBResult: bankrollTimelineResult({ cashP50: [300, 900] }),
            scaleGate: {
                status: ScaleGateStatus.NotEnoughSample,
                unmetConditions: [ScaleGateUnmetCondition.TradesBelowThreshold],
            },
        });
        expect(summary.optionA.scaleGateNote).toBeNull();
        expect(summary.optionB.scaleGateNote).toBe('scale gate not met');
        expect(summary.recommended).toBe(NextRoundRecommendation.OptionA);
    });

    it('never recommends option B while the scale gate is not ready, even when it has the higher expected monthly net', () => {
        const summary = nextRoundResultSummaryOf({
            dayBudget: 60,
            optionABudget: 100,
            optionAResult: bankrollTimelineResult({ cashP50: [100, 110] }),
            optionBBudget: 300,
            optionBResult: bankrollTimelineResult({ cashP50: [300, 900] }),
            scaleGate: {
                status: ScaleGateStatus.NotPositiveAfterCost,
                unmetConditions: [
                    ScaleGateUnmetCondition.PooledNetNotBeyondNoise,
                ],
            },
        });
        expect(summary.recommended).toBe(NextRoundRecommendation.OptionA);
    });

    it('recommends option B once the scale gate is ready and option B has the higher expected monthly net', () => {
        const summary = nextRoundResultSummaryOf({
            dayBudget: 60,
            optionABudget: 100,
            optionAResult: bankrollTimelineResult({ cashP50: [100, 110] }),
            optionBBudget: 300,
            optionBResult: bankrollTimelineResult({ cashP50: [300, 900] }),
            scaleGate: { status: ScaleGateStatus.Ready, unmetConditions: [] },
        });
        expect(summary.recommended).toBe(NextRoundRecommendation.OptionB);
    });

    it('marks option B "thresholds not set" when the scale gate has no thresholds', () => {
        const summary = nextRoundResultSummaryOf({
            dayBudget: 60,
            optionABudget: 100,
            optionAResult: bankrollTimelineResult(),
            optionBBudget: 300,
            optionBResult: bankrollTimelineResult(),
            scaleGate: {
                status: ScaleGateStatus.ThresholdsNotSet,
                unmetConditions: [],
            },
        });
        expect(summary.optionB.scaleGateNote).toBe('thresholds not set');
    });

    it('reports P(round net negative) and path ruin as percentages, and recommends the option with the higher expected monthly net', () => {
        const summary = nextRoundResultSummaryOf({
            dayBudget: 60,
            optionABudget: 100,
            optionAResult: bankrollTimelineResult({
                cashP50: [100, 500],
                pathRuin: fraction(0.1),
                pFinalNetNegative: fraction(0.2),
            }),
            optionBBudget: 300,
            optionBResult: bankrollTimelineResult({ cashP50: [300, 310] }),
            scaleGate: { status: ScaleGateStatus.Ready, unmetConditions: [] },
        });
        expect(summary.optionA.pRoundNetNegative).toBe('20.0%');
        expect(summary.optionA.pathRuin).toBe('10.0%');
        expect(summary.optionA.scaleGateNote).toBeNull();
        expect(summary.optionB.scaleGateNote).toBeNull();
        expect(summary.recommended).toBe(NextRoundRecommendation.OptionA);
    });
});

describe('roundsModel duplication guards (PT-62e)', () => {
    const roundsModelSource = readFileSync(
        path.join(
            process.cwd(),
            'src/app/(app)/prop-calculator/accounts/rounds/roundsModel.ts',
        ),
        'utf8',
    );

    it('reads the shared default eval and funded day constants, not its own copy', () => {
        expect(roundsModelSource).toMatch(
            /import\s*{[^}]*DEFAULT_FUNDED_HORIZON_DAYS[^}]*}\s*from\s*'~\/app\/\(app\)\/prop-calculator\/_components\/calculatorReducer'/,
        );
        expect(roundsModelSource).toMatch(
            /import\s*{[^}]*DEFAULT_MAX_EVAL_DAYS[^}]*}\s*from\s*'~\/app\/\(app\)\/prop-calculator\/_components\/calculatorReducer'/,
        );
        expect(roundsModelSource).not.toMatch(/=\s*60;/);
    });

    it('assembles the scale gate inputs through scaleGateFromLedger, not a re-derived copy', () => {
        expect(roundsModelSource).not.toContain('scaleGateOf(');
        expect(roundsModelSource).toContain('scaleGateFromLedger(');
    });
});
