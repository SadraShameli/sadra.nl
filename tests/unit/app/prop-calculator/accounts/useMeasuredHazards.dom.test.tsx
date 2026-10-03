import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { measuredHazardsOf } from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFormValues';
import {
    type MeasuredHazardsState,
    useMeasuredHazards,
} from '~/app/(app)/prop-calculator/accounts/rulebook/useMeasuredHazards';
import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
} from '~/lib/prop-accounts/core';
import {
    liveTransferRate,
    LiveTransferRateUnavailable,
} from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    purchased,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

interface FakeQuery {
    data: unknown;
    isError?: boolean;
}

interface Harness {
    accounts: FakeQuery;
    events: FakeQuery;
    fees: FakeQuery;
    payouts: FakeQuery;
    session: {
        data: undefined | { user: { id: string } };
        isPending?: boolean;
    };
}

const harness = vi.hoisted((): Harness => ({
    accounts: { data: undefined },
    events: { data: undefined },
    fees: { data: undefined },
    payouts: { data: undefined },
    session: { data: undefined },
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => harness.session,
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: { useQuery: () => harness.accounts } },
            event: { list: { useQuery: () => harness.events } },
            fee: { list: { useQuery: () => harness.fees } },
            payout: { list: { useQuery: () => harness.payouts } },
        },
    },
}));

function ledgerRows() {
    const moved = account(EVAL_PLAN, {
        purchasedOn: '2026-01-01',
        stage: AccountStage.Funded,
    });
    return {
        accounts: [moved],
        events: [
            purchased(moved),
            event(moved, AccountEventKind.EvalPassed, '2026-01-05'),
            event(moved, AccountEventKind.MovedLive, '2026-03-10'),
        ],
        payouts: [
            payout(moved, 5000, { paidOn: '2026-02-01' }),
            payout(moved, 5000, { paidOn: '2026-02-20' }),
        ],
        moved,
        userId: moved.userId,
    };
}

function ledgerOnlyLive() {
    return account(EVAL_PLAN, {
        planLabel: 'Imported live',
        planSerial: null,
        stage: AccountStage.Live,
        tracking: AccountTracking.LedgerOnly,
    });
}

describe('useMeasuredHazards (PT-73, F-V26)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let state: MeasuredHazardsState = {
        failed: false,
        measured: {},
        pending: true,
        unavailable: {},
    };
    let latest: MeasuredHazardsState['measured'] = {};

    function Probe() {
        state = useMeasuredHazards();
        latest = state.measured;
        return null;
    }

    function renderProbe() {
        act(() => {
            root.render(<Probe />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.accounts = { data: undefined };
        harness.events = { data: undefined };
        harness.fees = { data: undefined };
        harness.payouts = { data: undefined };
        harness.session = { data: undefined };
        latest = {};
        state = {
            failed: false,
            measured: {},
            pending: true,
            unavailable: {},
        };
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('measures nothing while the session or any query is unanswered', () => {
        renderProbe();
        expect(latest).toStrictEqual({});

        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        renderProbe();
        expect(latest).toStrictEqual({});
    });

    it('measures the moved-live rate per paid payout from the user ledger once every query answered', () => {
        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts };

        renderProbe();

        const built = ledger({
            accounts: rows.accounts,
            events: rows.events,
            payouts: rows.payouts,
        });
        const expected = measuredHazardsOf(
            liveTransferRate(built, new Date().toISOString().slice(0, 10)),
            built,
        );
        expect(Object.keys(expected)).toHaveLength(1);
        expect(latest).toStrictEqual(expected);
        const [measured] = Object.values(latest);
        expect(measured).toMatchObject({
            movedLiveCount: 1,
            paidPayouts: 2,
            rate: 0.5,
            suggestedText: '50',
        });
    });

    it('shows the reason instead of a failure when more accounts moved live than paid payouts exist', () => {
        const rows = ledgerRows();
        const second = account(EVAL_PLAN, {
            purchasedOn: '2026-01-02',
            stage: AccountStage.Funded,
        });
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: [...rows.accounts, second] };
        harness.events = {
            data: [
                ...rows.events,
                purchased(second),
                event(second, AccountEventKind.EvalPassed, '2026-01-06'),
                event(second, AccountEventKind.MovedLive, '2026-03-12'),
            ],
        };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts.slice(0, 1) };

        expect(() => {
            renderProbe();
        }).not.toThrow();

        expect(state.failed).toBe(false);
        expect(state.pending).toBe(false);
        expect(state.measured).toStrictEqual({});
        expect(Object.values(state.unavailable)).toStrictEqual([
            {
                reason: LiveTransferRateUnavailable.MoreTransfersThanPayouts,
                text: '2 transfers against 1 paid payout',
            },
        ]);
    });

    it('hands the ledger to the measured hazards, so accounts recorded straight at Live are disclosed', () => {
        const rows = ledgerRows();
        const recorded = ledgerOnlyLive();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: [...rows.accounts, recorded] };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = {
            data: [
                ...rows.payouts,
                payout(rows.moved, 5000, { paidOn: '2026-02-25' }),
            ],
        };
        renderProbe();
        const [measured] = Object.values(latest);
        expect(measured).toMatchObject({
            movedLiveCount: 2,
            paidPayouts: 3,
            recordedAtLiveCount: 1,
        });
        expect(state.unavailable).toStrictEqual({});
    });

    it('discloses the accounts recorded straight at Live in the reason a rate is withheld', () => {
        const first = ledgerOnlyLive();
        const second = ledgerOnlyLive();
        harness.session = { data: { user: { id: first.userId } } };
        harness.accounts = { data: [first, second] };
        harness.events = { data: [] };
        harness.fees = { data: [] };
        harness.payouts = {
            data: [payout(first, 5000, { paidOn: '2026-02-01' })],
        };
        renderProbe();
        expect(state.measured).toStrictEqual({});
        expect(Object.values(state.unavailable)).toStrictEqual([
            {
                reason: LiveTransferRateUnavailable.MoreTransfersThanPayouts,
                text: '2 transfers against 1 paid payout, includes 2 accounts recorded straight at Live',
            },
        ]);
    });

    it('has no unavailable reason for a firm whose rate was measured', () => {
        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts };
        renderProbe();
        expect(state.unavailable).toStrictEqual({});
    });

    it('ignores rows of another user', () => {
        const rows = ledgerRows();
        harness.session = { data: { user: { id: 'someone-else' } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts };

        renderProbe();

        expect(latest).toStrictEqual({});
    });

    it('reports pending while any query is unanswered and not failed once all answered', () => {
        renderProbe();
        expect(state).toMatchObject({ failed: false, pending: true });

        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts };
        renderProbe();
        expect(state).toMatchObject({ failed: false, pending: false });
    });

    it('reports a failure instead of silently measuring nothing when a query errors', () => {
        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: rows.accounts };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: undefined, isError: true };

        renderProbe();

        expect(state).toStrictEqual({
            failed: true,
            measured: {},
            pending: false,
            unavailable: {},
        });
    });

    it('reports a failure rather than crashing when the rows cannot be read into a ledger', () => {
        const rows = ledgerRows();
        harness.session = { data: { user: { id: rows.userId } } };
        harness.accounts = { data: [null] };
        harness.events = { data: rows.events };
        harness.fees = { data: [] };
        harness.payouts = { data: rows.payouts };

        const logged = vi.spyOn(console, 'error').mockImplementation(vi.fn());
        expect(() => {
            renderProbe();
        }).not.toThrow();

        expect(state).toStrictEqual({
            failed: true,
            measured: {},
            pending: false,
            unavailable: {},
        });
        expect(logged).toHaveBeenCalledTimes(1);
        logged.mockRestore();
    });
});
