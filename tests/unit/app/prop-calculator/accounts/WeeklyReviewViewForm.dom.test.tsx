import { skipToken } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeeklyReviewView } from '~/app/(app)/prop-calculator/accounts/review/WeeklyReviewView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    MONEY_ENTRY_MESSAGE,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    fraction,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const FIRST_ID = 'a1111111-1111-4111-8111-111111111111';
const SECOND_ID = 'a2222222-2222-4222-8222-222222222222';
const THIRD_ID = 'a3333333-3333-4333-8333-333333333333';
const REVIEW_ON = '2026-09-21';
const PREVIOUS_ON = '2026-09-14';
const SUBMIT_LABEL = 'Submit this week\u{2019}s review';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const inputs = new Map<string, unknown[]>();
    const mutateAsync = new Map<
        string,
        ReturnType<typeof vi.fn<(input: unknown) => Promise<unknown>>>
    >();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<(input: unknown) => Promise<unknown>>(() =>
            Promise.resolve({}),
        );
        mutateAsync.set(name, created);
        return created;
    }
    return {
        inputs,
        invalidate,
        mutateAsyncOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: vi.fn(),
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: (input?: unknown) => {
                inputs.set(name, [...(inputs.get(name) ?? []), input]);
                return queries.get(name) ?? pending;
            },
        }),
        reset() {
            queries.clear();
            inputs.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/review',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            decision: { latestForAll: harness.query('decision.latestForAll') },
            review: {
                stagesOn: harness.query('review.stagesOn'),
                submit: harness.mutation('review.submit'),
            },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
                update: harness.mutation('violation.update'),
            },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function findPlan(isMatch: (plan: Plan) => boolean) {
    const firm = ALL_FIRMS.find((candidate) => candidate.plans.some(isMatch));
    const plan = firm?.plans.find(isMatch);
    if (firm === undefined || plan === undefined) {
        throw new Error('no plan matches the predicate');
    }
    return { firm, plan };
}

const { firm: FIRM, plan: PLAN } = findPlan(
    (candidate) =>
        candidate.accountSize === 50_000 &&
        !candidate.isInstantFunded &&
        candidate.drawdownFor(TradingPhase.Eval).kind ===
            DrawdownKind.EodTrailing,
);

function acceptStateOf(card: HTMLElement, id: string): string | undefined {
    return card.querySelector<HTMLElement>(`#accept-${id}`)?.dataset.state;
}

function accountRow(id: string, label: string, overrides = {}) {
    return {
        accountSize: PLAN.accountSize,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firmId: FIRM.id,
        id,
        label,
        liveStartBalanceCents: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: null,
        planSerial: serializePlanId(PLAN.id),
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function buttonLabelled(scope: ParentNode, label: string): HTMLButtonElement {
    const button = [...scope.querySelectorAll('button')].find(
        (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`no button ${label}`);
    return button;
}

function fieldIn(card: HTMLElement, id: string): HTMLInputElement {
    const input = card.querySelector<HTMLInputElement>(`#${id}`);
    if (input === null) throw new Error(`no field ${id}`);
    return input;
}

async function flush() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
}

function previousDecision(accountId: string) {
    return {
        acceptedRiskCents: 100,
        accountId,
        actualRiskCents: null,
        decidedOn: PREVIOUS_ON,
        headlineRiskCents: 100,
        id: `d-${accountId}`,
    };
}

function previousSnapshot(accountId: string) {
    return {
        accountId,
        asOf: PREVIOUS_ON,
        balanceAtLastPayoutCents: null,
        balanceCents: 5_040_000,
        createdAt: new Date('2026-09-14T12:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: 5_060_000,
        highestIntradayBalanceCents: null,
        id: `s-${accountId}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        source: 'manual',
        tradingDays: 3,
        updatedAt: new Date('2026-09-14T12:00:00Z'),
        userId: 'user-a',
    };
}

function seed() {
    harness.queries.set(
        'account.list',
        answer([
            accountRow(FIRST_ID, 'Eval one'),
            accountRow(SECOND_ID, 'Eval two'),
        ]),
    );
    harness.queries.set(
        'snapshot.latestForAll',
        answer([previousSnapshot(FIRST_ID), previousSnapshot(SECOND_ID)]),
    );
    harness.queries.set(
        'decision.latestForAll',
        answer([previousDecision(FIRST_ID), previousDecision(SECOND_ID)]),
    );
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('violation.list', answer([]));
    harness.queries.set(
        'review.stagesOn',
        answer([
            { accountId: FIRST_ID, stage: AccountStage.Eval },
            { accountId: SECOND_ID, stage: AccountStage.Eval },
        ]),
    );
}

function submitted(): {
    decisions: readonly Record<string, unknown>[];
    snapshots: readonly Record<string, unknown>[];
} {
    const call = harness.mutateAsyncOf('review.submit').mock.calls[0];
    return call?.[0] as ReturnType<typeof submitted>;
}

function tick(card: HTMLElement, id: string) {
    const box = card.querySelector<HTMLElement>(`#${id}`);
    if (box === null) throw new Error(`no checkbox ${id}`);
    act(() => {
        box.click();
    });
}

function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', value, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('WeeklyReviewView form', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
        harness.reset();
        seed();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<WeeklyReviewView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    function cardOf(label: string): HTMLElement {
        const card = [
            ...container.querySelectorAll<HTMLElement>('[data-slot="card"]'),
        ].find((candidate) => candidate.textContent.includes(label));
        if (card === undefined) throw new Error(`no card for ${label}`);
        return card;
    }

    async function submit() {
        act(() => {
            buttonLabelled(container, SUBMIT_LABEL).click();
        });
        await flush();
    }

    it('shows a row nobody touched as unchanged since the previous snapshot and counts the rows not updated', () => {
        expect(cardOf('Eval one').textContent).toContain(
            `Unchanged since ${PREVIOUS_ON}`,
        );
        expect(container.textContent).toContain('2 accounts not updated');
    });

    it('prefills money fields in dollars and counts as plain numbers from the previous snapshot', () => {
        const first = cardOf('Eval one');
        expect(fieldIn(first, 'snapshot-balanceCents').value).toBe('50400');
        expect(fieldIn(first, 'snapshot-highestEodBalanceCents').value).toBe(
            '50600',
        );
        expect(fieldIn(first, 'snapshot-tradingDays').value).toBe('3');
    });

    it('leaves untouched rows out of the submission until one is ticked as unchanged, then posts its previous values', async () => {
        tick(cardOf('Eval two'), `unchanged-${SECOND_ID}`);
        expect(container.textContent).toContain('1 account not updated');
        await submit();
        const { decisions, snapshots } = submitted();
        expect(decisions).toEqual([]);
        expect(snapshots).toEqual([
            {
                accountId: SECOND_ID,
                balanceAtLastPayoutCents: null,
                balanceCents: 5_040_000,
                cumulativePayoutCents: null,
                cycleBestDayProfitCents: null,
                dashboardFloorCents: null,
                evalBestDayProfitCents: null,
                floorAtLastPayoutCents: null,
                highestEodBalanceCents: 5_060_000,
                highestIntradayBalanceCents: null,
                lastPayoutOn: null,
                lastTradedOn: null,
                payoutsTaken: null,
                qualifyingDaysSinceLastPayout: null,
                tradingDays: 3,
            },
        ]);
    });

    it('records nothing and says so when every row is untouched', async () => {
        await submit();
        expect(harness.mutateAsyncOf('review.submit')).not.toHaveBeenCalled();
    });

    it('shows the parse issue when Balance is typed as text and leaves that row out of the submission', async () => {
        const first = cardOf('Eval one');
        typeInto(fieldIn(first, 'snapshot-balanceCents'), 'abc');
        expect(cardOf('Eval one').textContent).toContain(MONEY_ENTRY_MESSAGE);
        expect(cardOf('Eval one').textContent).toContain(
            'Fix the entry above to size it',
        );
        tick(cardOf('Eval two'), `unchanged-${SECOND_ID}`);
        await submit();
        const { snapshots } = submitted();
        expect(snapshots.map((snapshot) => snapshot.accountId)).toEqual([
            SECOND_ID,
        ]);
        expect(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents').value).toBe(
            'abc',
        );
        expect(cardOf('Eval one').textContent).toContain(MONEY_ENTRY_MESSAGE);
    });

    it('blocks a row whose required field was emptied and never posts last week values for it', async () => {
        const first = cardOf('Eval one');
        typeInto(fieldIn(first, 'snapshot-tradingDays'), '');
        expect(cardOf('Eval one').textContent).toContain(
            'Fix the entry above to size it',
        );
        tick(cardOf('Eval two'), `unchanged-${SECOND_ID}`);
        await submit();
        expect(
            submitted().snapshots.map((snapshot) => snapshot.accountId),
        ).toEqual([SECOND_ID]);
    });

    it('shows the plausibility message beside a blocked entry and does not post it', async () => {
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents'), '2400');
        expect(cardOf('Eval one').textContent).toContain(
            'set the dashboard convention to $0-based',
        );
        tick(cardOf('Eval two'), `unchanged-${SECOND_ID}`);
        await submit();
        expect(
            submitted().snapshots.map((snapshot) => snapshot.accountId),
        ).toEqual([SECOND_ID]);
    });

    it('posts an edited row with its size change versus last week and the accepted size', async () => {
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        expect(cardOf('Eval one').textContent).toContain('vs last week');
        tick(cardOf('Eval one'), `accept-${FIRST_ID}`);
        await submit();
        const { decisions, snapshots } = submitted();
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toEqual({
            accountId: FIRST_ID,
            balanceAtLastPayoutCents: null,
            balanceCents: 5_040_000,
            cumulativePayoutCents: null,
            cycleBestDayProfitCents: null,
            dashboardFloorCents: null,
            evalBestDayProfitCents: null,
            floorAtLastPayoutCents: null,
            highestEodBalanceCents: 5_060_000,
            highestIntradayBalanceCents: null,
            lastPayoutOn: null,
            lastTradedOn: null,
            payoutsTaken: null,
            qualifyingDaysSinceLastPayout: null,
            tradingDays: 5,
        });
        expect(decisions).toHaveLength(1);
        expect(decisions[0]).toMatchObject({
            accountId: FIRST_ID,
            stage: AccountStage.Eval,
        });
        expect(decisions[0]?.acceptedRiskCents).toBe(
            decisions[0]?.headlineRiskCents,
        );
        expect(
            (decisions[0]?.acceptedRungsCents as readonly number[]).length,
        ).toBeGreaterThan(0);
    });

    it('offers no accept tick on a row that is not going to be recorded, and offers one on an edited row', () => {
        expect(
            cardOf('Eval one').querySelector(`#accept-${FIRST_ID}`),
        ).toBeNull();
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        expect(
            cardOf('Eval one').querySelector(`#accept-${FIRST_ID}`),
        ).not.toBeNull();
    });

    it('sizes a row ticked as unchanged from the date of its snapshot: an old eval snapshot is stale and offers no size to accept', async () => {
        tick(cardOf('Eval one'), `unchanged-${FIRST_ID}`);
        expect(cardOf('Eval one').textContent).toContain(
            'Stale; no amount suggested',
        );
        expect(
            cardOf('Eval one').querySelector(`#accept-${FIRST_ID}`),
        ).toBeNull();
        await submit();
        expect(submitted().decisions).toEqual([]);
        expect(submitted().snapshots).toHaveLength(1);
    });

    it('says which rows are left out and how to include them, including a row that has no snapshot to record as unchanged', () => {
        harness.queries.set(
            'snapshot.latestForAll',
            answer([previousSnapshot(FIRST_ID)]),
        );
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(container.textContent).toContain(
            '2 accounts not updated: they are left out of the snapshots and decisions of this review unless you enter a snapshot or tick Record as unchanged.',
        );
        expect(
            cardOf('Eval two').querySelector(`#unchanged-${SECOND_ID}`),
        ).toBeNull();
        expect(
            cardOf('Eval one').querySelector(`#unchanged-${FIRST_ID}`),
        ).not.toBeNull();
    });

    it('drops an accept tick when the row stops being ready and does not bring it back at a different size', async () => {
        const headline = () =>
            /Documented headline: \$[\d,]+/.exec(
                cardOf('Eval one').textContent,
            )?.[0];
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        tick(cardOf('Eval one'), `accept-${FIRST_ID}`);
        const before = headline();
        expect(before).toBeDefined();
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents'), 'abc');
        expect(
            cardOf('Eval one').querySelector(`#accept-${FIRST_ID}`),
        ).toBeNull();
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents'), '48900');
        expect(headline()).toBeDefined();
        expect(headline()).not.toBe(before);
        expect(acceptStateOf(cardOf('Eval one'), FIRST_ID)).toBe('unchecked');
        await submit();
        expect(submitted().decisions).toEqual([]);
        expect(submitted().snapshots).toHaveLength(1);
    });

    it('keeps the accept tick when the row goes through an invalid entry and comes back at the same size', async () => {
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        tick(cardOf('Eval one'), `accept-${FIRST_ID}`);
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents'), 'abc');
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-balanceCents'), '50400');
        expect(acceptStateOf(cardOf('Eval one'), FIRST_ID)).toBe('checked');
        await submit();
        expect(submitted().decisions).toHaveLength(1);
    });

    it('keeps what was typed while the submission is being reloaded and clears it once the reload lands, with the recorded row then reading as already recorded', async () => {
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        const reload = Promise.withResolvers<boolean>();
        harness.invalidate.mockImplementationOnce(async () => {
            await reload.promise;
        });
        act(() => {
            buttonLabelled(container, SUBMIT_LABEL).click();
        });
        await flush();
        expect(
            fieldIn(cardOf('Eval one'), 'snapshot-tradingDays').value,
        ).toBe('5');
        expect(cardOf('Eval one').textContent).not.toContain(
            `Unchanged since ${PREVIOUS_ON}`,
        );
        harness.queries.set(
            'snapshot.latestForAll',
            answer([
                {
                    ...previousSnapshot(FIRST_ID),
                    asOf: REVIEW_ON,
                    tradingDays: 5,
                },
                previousSnapshot(SECOND_ID),
            ]),
        );
        await act(async () => {
            reload.resolve(true);
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });
        const first = cardOf('Eval one');
        expect(first.textContent).toContain(
            `Already recorded for ${REVIEW_ON}`,
        );
        expect(first.querySelector(`#unchanged-${FIRST_ID}`)).toBeNull();
        expect(container.textContent).toContain('1 account not updated');
    });

    it('keeps the entries of a rejected submission', async () => {
        harness
            .mutateAsyncOf('review.submit')
            .mockRejectedValueOnce(new Error('rejected'));
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        await submit();
        expect(
            fieldIn(cardOf('Eval one'), 'snapshot-tradingDays').value,
        ).toBe('5');
    });

    it('labels the headline as documented for the default rulebook and states what the review does not check', () => {
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        const text = cardOf('Eval one').textContent;
        expect(text).toContain('Documented headline:');
        expect(text).toContain(
            'Assumes no payout is pending and does not check the live triggers',
        );
    });

    it('labels the headline as your custom rule once the rulebook differs from the hard rules', () => {
        harness.queries.set(
            'rulebook.get',
            answer({
                ...DEFAULT_RULEBOOK,
                live: {
                    ...DEFAULT_RULEBOOK.live,
                    cushionPercent: {
                        ...DEFAULT_RULEBOOK.live.cushionPercent,
                        postLock: fraction(0.2),
                    },
                },
            }),
        );
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        typeInto(fieldIn(cardOf('Eval one'), 'snapshot-tradingDays'), '5');
        const text = cardOf('Eval one').textContent;
        expect(text).toContain('your custom rule (differs from');
        expect(text).not.toContain('Documented headline:');
    });

    it('asks for the fields of the stage the account had on the review date, as the server will check them', () => {
        harness.queries.set(
            'account.list',
            answer([
                accountRow(FIRST_ID, 'Eval one'),
                accountRow(THIRD_ID, 'Moved live', {
                    stage: AccountStage.Live,
                }),
            ]),
        );
        harness.queries.set(
            'snapshot.latestForAll',
            answer([
                previousSnapshot(FIRST_ID),
                {
                    ...previousSnapshot(THIRD_ID),
                    balanceCents: 5_050_000,
                    dashboardFloorCents: 4_900_000,
                    highestEodBalanceCents: null,
                    payoutsTaken: 0,
                    tradingDays: 4,
                },
            ]),
        );
        harness.queries.set(
            'review.stagesOn',
            answer([
                { accountId: FIRST_ID, stage: AccountStage.Eval },
                { accountId: THIRD_ID, stage: AccountStage.Funded },
            ]),
        );
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(cardOf('Moved live').textContent).toContain(
            'Needs: Highest end-of-day balance',
        );
    });

    it('asks the server for the stages on the review date only once the rulebook that sets it has loaded', () => {
        harness.reset();
        seed();
        harness.queries.delete('rulebook.get');
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(harness.inputs.get('review.stagesOn')?.at(-1)).toBe(skipToken);
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(harness.inputs.get('review.stagesOn')?.at(-1)).toEqual({
            asOf: REVIEW_ON,
        });
    });

    it('waits for the stages before showing any row, rather than guessing from the stage today', () => {
        harness.queries.delete('review.stagesOn');
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(container.textContent).not.toContain('Eval one');
        expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('waits for the stages while an account has none yet', () => {
        harness.queries.set(
            'review.stagesOn',
            answer([{ accountId: FIRST_ID, stage: AccountStage.Eval }]),
        );
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(container.textContent).not.toContain('Eval one');
    });

    it('shows a load failure when the stages cannot be loaded', () => {
        harness.queries.set('review.stagesOn', {
            data: undefined,
            error: new Error('boom'),
            isError: true,
            isPending: false,
        });
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(container.textContent).toContain('Could not load');
    });
});
