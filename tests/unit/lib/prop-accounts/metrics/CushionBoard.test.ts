import { describe, expect, it } from 'vitest';

import { usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateUnavailableKind,
    cushionBoardOf,
    CushionRatioBasis,
    documentedFundedRiskOf,
} from '~/lib/prop-accounts/metrics';
import { dollars, TradingPhase } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK, RetainedCushionBasis } from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    reconstructedEntry,
    unavailableEntry,
} from '../reconstructionFixtures';

describe('cushionBoardOf', () => {
    it('reports the funded cushion ratio against the documented funded risk', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + documentedRisk * 3,
        });
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded, { asOf: '2026-09-20' }),
        ]);
        expect(board.unavailable).toEqual([]);
        expect(board.rows).toHaveLength(1);
        const [row] = board.rows;
        expect(row?.accountId).toBe('a1');
        expect(row?.asOf).toBe('2026-09-20');
        expect(row?.ratio.basis).toBe(CushionRatioBasis.Funded);
        expect(row?.ratio.basisAmount).toBe(documentedRisk);
        expect(row?.ratio.ratio).toBeCloseTo(
            funded.cushion / documentedRisk,
            6,
        );
        expect(row?.cushionCents).toEqual(
            usdCentsFromDollars(funded.cushion),
        );
        expect(row?.floorCents).toEqual(
            usdCentsFromDollars(funded.state.threshold),
        );
    });

    it('reports the eval cushion ratio against the eval drawdown amount', () => {
        const plan = mffProPlan();
        const evalDrawdown = plan.drawdownFor(TradingPhase.Eval).amount;
        const evalAccount = evalReconstructed(plan, {
            balance: plan.accountSize + evalDrawdown / 2,
        });
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, evalAccount),
        ]);
        const [row] = board.rows;
        expect(row?.ratio.basis).toBe(CushionRatioBasis.Eval);
        expect(row?.ratio.basisAmount).toBe(evalDrawdown);
        expect(row?.ratio.ratio).toBeCloseTo(
            evalAccount.cushion / evalDrawdown,
            6,
        );
    });

    it('reports the live cushion against PT-46 retained cushion, with its basis', () => {
        const plan = mffProPlan();
        const live = liveReconstructed(plan);
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, live),
        ]);
        const [row] = board.rows;
        expect(row?.ratio.basis).toBe(CushionRatioBasis.Live);
        expect(row?.ratio.basisAmount).toBe(
            live.livePlan?.defaultRetainedCushion(),
        );
        expect(row?.ratio.retainedCushionBasis).toBe(
            RetainedCushionBasis.LiveOneDrawdown,
        );
    });

    it('lists not-reconstructed accounts separately, never in rows', () => {
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            unavailableEntry('a1', { kind: AccountStateUnavailableKind.NoSnapshot }),
        ]);
        expect(board.rows).toEqual([]);
        expect(board.unavailable).toEqual([
            { accountId: 'a1', reason: { kind: AccountStateUnavailableKind.NoSnapshot } },
        ]);
    });

    it('ranks rows by nearness to the floor, ascending ratio first', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const near = fundedReconstructed(plan, {
            balance: plan.accountSize + documentedRisk * 0.5,
        });
        const far = fundedReconstructed(plan, {
            balance: plan.accountSize + documentedRisk * 5,
        });
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('far', plan, far),
            reconstructedEntry('near', plan, near),
        ]);
        expect(board.rows.map((row) => row.accountId)).toEqual([
            'near',
            'far',
        ]);
    });

    it('produces cent values only through usdCentsFromDollars', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: dollars(plan.accountSize + 123.45),
        });
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        expect(row?.cushionCents).toBe(usdCentsFromDollars(funded.cushion));
    });
});
