import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    overviewAccountRequestsFor,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    overviewPlanValueRequestsFor,
    type OverviewRequest,
    overviewRequestKey,
    overviewRequestSchema,
    overviewRetireRequestsFor,
    withPreviousAccount,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    NO_PLAN_OPT_INS,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    type AccountPendingPayoutCounts,
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const PLAN_ID = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
} as const;

const SNAPSHOT: AccountSnapshotInput = {
    asOf: '2026-09-26',
    balance: dollars(55_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    highestEodBalance: dollars(55_000),
    highestIntradayBalance: dollars(55_000),
    pendingPayouts: dollars(1000),
    stage: SizingStage.Funded,
};

const COUNTS = {
    otherAccountsPendingPayoutCount: 1,
    pendingPayoutCount: 2,
} as const;

function accountInput(
    pendingPayoutCounts: AccountPendingPayoutCounts = NO_PENDING_PAYOUT_COUNTS,
) {
    const plan = findFirm(PLAN_ID.firm)?.findPlan(PLAN_ID);
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return {
        account: SNAPSHOT,
        firmId: plan.id.firm,
        measuredRebuyLag: null,
        optIns: NO_PLAN_OPT_INS,
        pendingPayoutCounts,
        planSerial: serializePlanId(plan.id),
    };
}

function accountRequest(
    pendingPayoutCounts: AccountPendingPayoutCounts = NO_PENDING_PAYOUT_COUNTS,
): OverviewRequest {
    const [request] = overviewAccountRequestsFor(
        [accountInput(pendingPayoutCounts)],
        DEFAULT_RULEBOOK,
    );
    if (request === undefined) throw new Error('no account request');
    return request;
}

function withoutCountsOf(request: OverviewRequest): OverviewRequest {
    const { firmId, kind, optIns, planSerial, spec } = request;
    return {
        ...(request.account !== undefined && { account: request.account }),
        firmId,
        kind,
        optIns,
        planSerial,
        spec,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the overview worker message carries the pending payout counts (PT-36m, F-145)', () => {
    it('copies the counts onto the account-from-state request and survives structuredClone and the schema', () => {
        const request = accountRequest(COUNTS);
        expect(request.pendingPayoutCounts).toEqual(COUNTS);
        expect(structuredClone(request)).toEqual(request);
        expect(overviewRequestSchema.parse(structuredClone(request))).toEqual(
            request,
        );
    });

    it('carries the named not-checked value on the request when the caller passes it', () => {
        expect(accountRequest().pendingPayoutCounts).toBe(
            NO_PENDING_PAYOUT_COUNTS,
        );
    });

    it('carries the named not-checked value on the retire request when the caller passes it', () => {
        const [request] = overviewRetireRequestsFor(
            [accountInput()],
            DEFAULT_RULEBOOK,
        );
        expect(request?.pendingPayoutCounts).toBe(NO_PENDING_PAYOUT_COUNTS);
    });

    it('copies the counts onto the retire request too', () => {
        const [request] = overviewRetireRequestsFor(
            [accountInput(COUNTS)],
            DEFAULT_RULEBOOK,
        );
        expect(request?.pendingPayoutCounts).toEqual(COUNTS);
    });

    it('keys the request by its counts, and the named zero counts key like a copy of themselves', () => {
        expect(overviewRequestKey(accountRequest(COUNTS))).not.toBe(
            overviewRequestKey(accountRequest()),
        );
        expect(overviewRequestKey(accountRequest())).toBe(
            overviewRequestKey(accountRequest({ ...NO_PENDING_PAYOUT_COUNTS })),
        );
        expect(overviewRequestKey(accountRequest(COUNTS))).toBe(
            overviewRequestKey(accountRequest({ ...COUNTS })),
        );
    });

    it('does not default a missing count to zero: an input without counts yields a request the schema rejects (PT-36p)', () => {
        const [request] = overviewAccountRequestsFor(
            [{ ...accountInput(), pendingPayoutCounts: undefined } as never],
            DEFAULT_RULEBOOK,
        );
        expect(request?.pendingPayoutCounts).toBeUndefined();
        expect(overviewRequestSchema.safeParse(request).success).toBe(false);
    });

    it('rejects counts on a request that is not an account request', () => {
        const [planValues] = overviewPlanValueRequestsFor(
            [
                {
                    firmId: PLAN_ID.firm,
                    measuredRebuyLag: null,
                    optIns: NO_PLAN_OPT_INS,
                    planSerial: serializePlanId(PLAN_ID),
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(
            overviewRequestSchema.safeParse({
                ...planValues,
                pendingPayoutCounts: COUNTS,
            }).success,
        ).toBe(false);
    });

    it('rejects an account request that carries no counts', () => {
        const request = withoutCountsOf(accountRequest(COUNTS));
        expect(overviewRequestSchema.safeParse(request).success).toBe(false);
    });

    it('rejects a fractional or negative count', () => {
        const request = accountRequest();
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                pendingPayoutCounts: { ...COUNTS, pendingPayoutCount: 1.5 },
            }).success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                pendingPayoutCounts: {
                    ...COUNTS,
                    otherAccountsPendingPayoutCount: -1,
                },
            }).success,
        ).toBe(false);
    });

    it('rebuilds the account with the counts it was sent, and with the named not-checked value when the caller passed it', () => {
        const rebuild = vi
            .spyOn(AccountReconstruction, 'rebuild')
            .mockImplementation(() => {
                throw new Error('stop after the reconstruction');
            });
        const withCounts = overviewOutcomeOf(accountRequest(COUNTS));
        const without = overviewOutcomeOf(accountRequest());
        expect(withCounts.kind).toBe(OverviewOutcomeKind.Failed);
        expect(without.kind).toBe(OverviewOutcomeKind.Failed);
        expect(rebuild).toHaveBeenCalledTimes(2);
        expect(rebuild.mock.calls[0]?.[3]).toEqual(COUNTS);
        expect(rebuild.mock.calls[1]?.[3]).toBe(NO_PENDING_PAYOUT_COUNTS);
    });

    it('refuses to rebuild an account request that carries no counts instead of assuming none', () => {
        const rebuild = vi.spyOn(AccountReconstruction, 'rebuild');
        const outcome = overviewOutcomeOf(
            withoutCountsOf(accountRequest(COUNTS)),
        );
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toContain('pending payout counts');
        expect(rebuild).not.toHaveBeenCalled();
    });

    it('rebuilds the previous snapshot with the counts it was sent, not with the counts of the latest snapshot (PT-90, F-V29)', () => {
        const rebuild = vi.spyOn(AccountReconstruction, 'rebuild');
        const previousCounts = {
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
        } as const;
        const previousSnapshot = {
            ...SNAPSHOT,
            asOf: '2026-09-25',
            balance: dollars(55_500),
        };
        const base = accountRequest(COUNTS);
        const request = withPreviousAccount(
            { ...base, spec: { ...base.spec, run: { ...base.spec.run, trials: 30 } } },
            { account: previousSnapshot, pendingPayoutCounts: previousCounts },
        );
        if (request === undefined) throw new Error('no request');
        overviewOutcomeOf(request);
        const countsOf = (snapshot: typeof SNAPSHOT) =>
            rebuild.mock.calls
                .filter((call) => call[0] === snapshot)
                .map((call) => call[3]);
        expect(countsOf(SNAPSHOT)).toEqual([COUNTS]);
        expect(countsOf(previousSnapshot)).toEqual([previousCounts]);
    });
});
