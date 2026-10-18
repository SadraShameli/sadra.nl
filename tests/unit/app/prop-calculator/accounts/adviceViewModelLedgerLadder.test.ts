import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
    ledgerRecordedLadderRowOf,
    OptimumRowStatus,
    type PersonalLimits,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    LEDGER_FILE,
    LEDGER_SECTION,
    ledgerRecordedLadderFor,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

function apexEod(): Plan {
    const id = {
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    } as const;
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function evalAdvisor(): EvalSizingAdvisor {
    const evalState = state();
    return new EvalSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: evalState.balance - evalState.threshold,
            fundedTracker: null,
            kind: TradingPhase.Eval,
            plan: apexEod(),
            resolvedDailyLossLimit: null,
            state: evalState,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 5,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function fundedAdvisor(): FundedSizingAdvisor {
    const fundedState = state({ qualifyingDays: 20, tradingDays: 20 });
    return new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: fundedState.balance - fundedState.threshold,
            fundedTracker: newFundedCycleTracker({
                ...fundedState,
                balance: fundedState.startingBalance,
            }),
            kind: TradingPhase.Funded,
            plan: apexEod(),
            resolvedDailyLossLimit: null,
            state: fundedState,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 90,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function state(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
        ...overrides,
    };
}

const WITH_PLAN: PersonalLimits = {
    ...NO_PERSONAL_LIMITS,
    viewContext: { placement: null, plan: apexEod() },
};

function recordedRow() {
    const row = ledgerRecordedLadderFor(FirmId.Apex, ApexVariant.Eod);
    if (row === null) throw new Error('no recorded Apex EOD ladder');
    return row;
}

function rowsOf(
    advice: ReturnType<EvalSizingAdvisor['assemble']>,
    limits: PersonalLimits,
) {
    const view = adviceViewModel(advice, limits);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    return view.optima.filter(
        (row) => row.source === AdviceSource.LedgerRecordedLadder,
    );
}

describe('the ledger-recorded ladder is a row of the eval advice (PT-108 step 12, F-156)', () => {
    it('adds one row for an eval account with the ladder, its source file, section and row', () => {
        const [row, ...rest] = rowsOf(evalAdvisor().assemble([]), WITH_PLAN);

        expect(rest).toEqual([]);
        expect(row?.status).toBe(OptimumRowStatus.Ready);
        expect(row?.label).toBe('Ledger-recorded ladder');
        expect(row?.ladder).toEqual(recordedRow().ladder);
        const text = row?.text ?? '';
        expect(text).toContain('ladder $800, $200, $100, $800');
        expect(text).toContain('Pass rate 40.8%');
        expect(text).toContain('8.5 days to funded');
        expect(text).toContain('cost per funded $1,535');
        expect(text).toContain(LEDGER_FILE);
        expect(text).toContain(LEDGER_SECTION);
        expect(text).toContain(`row ${recordedRow().provenance.row}`);
    });

    it('puts the ledger row after the engine rows', () => {
        const advice = evalAdvisor().assemble([]);
        const view = adviceViewModel(advice, WITH_PLAN);
        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }

        expect(view.optima.at(-1)?.source).toBe(
            AdviceSource.LedgerRecordedLadder,
        );
    });

    it('marks a stale ledger row as stale', () => {
        const row = ledgerRecordedLadderRowOf({
            ...recordedRow(),
            stale: true,
        });

        expect(row.text).toContain('stale');
    });

    it('says nothing about staleness for a current ledger row', () => {
        const row = ledgerRecordedLadderRowOf({
            ...recordedRow(),
            stale: false,
        });

        expect(row.text).not.toContain('stale');
    });

    it('adds no ledger row for a funded account', () => {
        expect(rowsOf(fundedAdvisor().assemble([]), WITH_PLAN)).toEqual([]);
    });

    it('adds no ledger row when the view knows no plan', () => {
        expect(rowsOf(evalAdvisor().assemble([]), NO_PERSONAL_LIMITS)).toEqual(
            [],
        );
    });
});
