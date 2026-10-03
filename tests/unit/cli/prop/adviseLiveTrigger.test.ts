import { parseArgs } from 'citty';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    nextTradeRiskReport,
    NextTradeRiskReportKind,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountSubstate,
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'Accounts convert after the third payout.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/per-account',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const state: AccountState = {
    balance: 55_000,
    bestDayProfit: 0,
    consecutiveIdleDays: 0,
    intradayHighProfit: 0,
    peakDayCloseProfit: 0,
    peakIntradayProfit: 0,
    qualifyingDays: 20,
    startingBalance: 50_000,
    threshold: 50_100,
    thresholdLocked: true,
    todayPnL: 0,
    tradingDays: 20,
};

const FRESH_FUNDED_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

function reportLinesFor(
    policy: FirmAccountPolicy,
    payoutsIssued: number,
    paidPayoutsSinceLastLiveAccount: null | number = null,
): string[] {
    const plan = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!plan) throw new Error('MFF Pro missing');
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = payoutsIssued;
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
    const advice = new FundedSizingAdvisor({
        account,
        accountPolicy: policy,
        fundedHorizonDays: 252,
        paidPayoutsSinceLastLiveAccount,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).assemble([]);
    return adviceReportLines(advice);
}

describe('prop advise words the live trigger by scope (PT-36f, step 6)', () => {
    it("names this account's payout count and its source for a per-account trigger", () => {
        const lines = reportLinesFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, SOURCE),
            ]),
            2,
        );
        const payoutLine = lines.find((line) => line.startsWith('payout:'));

        expect(payoutLine).toContain('live-account transition');
        expect(payoutLine).toContain('2 of 3 payouts taken on this account');
        expect(payoutLine).toContain(SOURCE.url);
        expect(payoutLine).toContain(SOURCE.quote);
        expect(payoutLine).toContain(SOURCE.fetchedOn);
    });

    it("names the firm-wide count since the last live account for a firm-total trigger, never this account's count", () => {
        const lines = reportLinesFor(
            new StubTriggerPolicy([new PayoutCountTotalTrigger(10, SOURCE)]),
            0,
            9,
        );
        const payoutLine = lines.find((line) => line.startsWith('payout:'));

        expect(payoutLine).toContain(
            "9 of 10 payouts taken across the firm's accounts since the last live account",
        );
        expect(payoutLine).not.toContain('on this account');
    });
});

describe('prop advise hands the firm account policy to the advisor (PT-36f)', () => {
    it("passes the registered firm's own account policy", () => {
        const { options, plan } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD),
        );

        expect(options.accountPolicy).toBe(
            findFirm(plan.id.firm)?.accountPolicy,
        );
    });
});

describe('the suspended risk-check reason is the typed Suspended text (PT-36f, PT-19i LOW)', () => {
    it('reports the typed reason text when the risk check does not run for a suspended account', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--suspended']),
        );
        const advisor = createSizingAdvisor(
            AccountReconstruction.rebuild(
                snapshot,
                plan,
                null,
                NO_PENDING_PAYOUT_COUNTS,
            ),
            options,
        );
        expect(options.substate).toBe(AccountSubstate.Suspended);

        const report = nextTradeRiskReport(advisor, {
            losses: 0,
            proposedRisk: dollars(500),
            wins: 0,
        });

        expect(report.kind).toBe(NextTradeRiskReportKind.NotRun);
        if (report.kind !== NextTradeRiskReportKind.NotRun) return;
        expect(report.reason).toBe(
            differenceReasonText({ kind: DifferenceReason.Suspended }),
        );
    });

    it('keeps no free-text suspended refusal in the command', () => {
        const text = readFileSync(
            path.join(REPO_ROOT, 'src/cli/commands/prop/advise/command.ts'),
            'utf8',
        );

        expect(text).not.toContain('RISK_CHECK_SUSPENDED_REASON');
        expect(text).not.toContain(
            'the account is suspended, so no sizing is given',
        );
    });
});
