import { beforeAll, describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { toSimInputs } from '~/lib/prop-calculator/advisor/policy';
import {
    freshFundedAccount,
    type FundedMilestone,
    MilestoneKind,
    milestoneState,
    requestNowValue,
} from '~/lib/prop-calculator/advisor/value';
import { REQUEST_NOW_LIVE_TRIAL_CAP } from '~/lib/prop-calculator/advisor/value/ValueChain';
import {
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { liveTransferValueAfterPayout } from '~/lib/prop-calculator/simulator';

const HAZARD = 0.3;

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const PLAN = rapidEodPlan();

interface LiveRun {
    readonly fromRequest: number;
    readonly fromSimulator: number;
    readonly liveStandardError: null | number;
    readonly requestNow: ReturnType<typeof requestNowValue>;
}

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const account = freshFundedAccount(PLAN);
    account.state.balance = 53_000;
    return account;
}

function liveValueOf(trials: number, liveTrials: number): LiveRun {
    const spec = specWith(trials);
    const account = fundedAccount();
    const milestone: FundedMilestone | ReturnType<typeof milestoneState> =
        milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error('expected a funded milestone');
    }
    const { continuation, requestNow, traderReceives } = requestNowValue(
        account,
        milestone,
        spec,
    );
    const base = toSimInputs(PLAN, spec);
    const live = liveTransferValueAfterPayout(
        base,
        milestone.state,
        liveTrials,
    );
    return {
        fromRequest:
            (requestNow.creditFree.value -
                traderReceives -
                (1 - HAZARD) * continuation.creditFree.value) /
            HAZARD,
        fromSimulator: live.value,
        liveStandardError: live.standardError,
        requestNow: { continuation, requestNow, traderReceives },
    };
}

function specWith(trials: number): DocumentedPolicySpec {
    return {
        enginePolicy: {
            ...buildEnginePolicy({
                fundedHorizonDays: 90,
                plan: PLAN,
                rulebook: DEFAULT_RULEBOOK,
            }).policy,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        },
        rulebook: {
            ...DEFAULT_RULEBOOK,
            liveTransfer: {
                hazardPerPaidPayoutByFirm: { [FirmId.Mffu]: HAZARD },
            },
        },
        run: { maxEvalDays: 40, seed: 5, trials },
    };
}

const CAPPED_TRIALS = REQUEST_NOW_LIVE_TRIAL_CAP + 100;

describe('the request-now live continuations are capped so the priced figure stays cheap (PT-73g step 7)', () => {
    it('names the cap, set from a measurement on the PC at 2000 trials (MFFU Rapid EOD, 30% hazard, MNQ 10): the continuation took about 2.6 to 3.1 s, the live runs about 0.9 to 1.3 s uncapped (30% to 48% extra, over the 20% limit) and about 0.2 to 0.3 s at 500 (about 8% to 10%)', () => {
        expect(REQUEST_NOW_LIVE_TRIAL_CAP).toBe(500);
    });

    describe('above the cap', () => {
        let live: LiveRun;

        beforeAll(() => {
            live = liveValueOf(CAPPED_TRIALS, REQUEST_NOW_LIVE_TRIAL_CAP);
        });

        it('runs exactly the cap of live continuations', () => {
            expect(live.fromRequest).toBeCloseTo(live.fromSimulator, 6);
        });

        it('widens the standard error with the real live run count, not the continuation trials', () => {
            const { continuation, requestNow } = live.requestNow;
            const continuationError = continuation.creditFree.standardError;
            if (continuationError === null || live.liveStandardError === null) {
                throw new Error('expected standard errors');
            }

            expect(requestNow.creditFree.standardError).toBeCloseTo(
                Math.hypot(
                    (1 - HAZARD) * continuationError,
                    HAZARD * live.liveStandardError,
                ),
                9,
            );
        });

        it('says in the request-now hazard note that the live part ran fewer trials than the rest', () => {
            const { liveTransfer } = live.requestNow.requestNow;

            expect(liveTransfer?.notes).toContain(
                `The requested payout's own transfer chance is priced from ${REQUEST_NOW_LIVE_TRIAL_CAP} runs, fewer than the ${CAPPED_TRIALS} behind the rest of this figure, so that part carries a wider error.`,
            );
        });

        it('leaves the continuation hazard note without the cap line', () => {
            const { continuation } = live.requestNow;

            expect(
                continuation.liveTransfer?.notes.join(' ') ?? '',
            ).not.toContain('own transfer chance');
        });
    });

    describe('below the cap', () => {
        let live: LiveRun;

        beforeAll(() => {
            live = liveValueOf(60, 60);
        });

        it('runs one live continuation per trial', () => {
            expect(live.fromRequest).toBeCloseTo(live.fromSimulator, 6);
        });

        it('adds no cap line to the hazard note', () => {
            expect(
                live.requestNow.requestNow.liveTransfer?.notes.join(' ') ?? '',
            ).not.toContain('own transfer chance');
        });
    });
});
