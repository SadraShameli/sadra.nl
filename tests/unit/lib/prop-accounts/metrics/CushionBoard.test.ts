import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateUnavailableKind,
    cushionBoardOf,
    CushionRatioBasis,
    documentedFundedRiskOf,
    FundedRiskBasis,
} from '~/lib/prop-accounts/metrics';
import { dollars, TradingPhase } from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    documentedFundedRisk,
    NO_PERSONAL_CAPS,
    RetainedCushionBasis,
} from '~/lib/prop-calculator/advisor';

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
        expect(row?.cushionCents).toEqual(usdCentsFromDollars(funded.cushion));
        expect(row?.floorCents).toEqual(
            usdCentsFromDollars(funded.state.threshold),
        );
    });

    it('reports the funded cushion ratio against the rulebook basis when no personal max risk is set', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + documentedRisk * 3,
        });
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        expect(row?.ratio.fundedRiskBasis).toBe(FundedRiskBasis.RulebookFunded);
        expect(row?.ratio.basisAmount).toBe(documentedRisk);
    });

    it('uses the smaller personal max risk per trade as the funded basis when one is set', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const personalMaxRiskPerTrade = documentedRisk / 4;
        const funded = {
            ...fundedReconstructed(plan, {
                balance: plan.accountSize + documentedRisk * 3,
            }),
            personalMaxRiskPerTrade,
        };
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        expect(row?.ratio.fundedRiskBasis).toBe(
            FundedRiskBasis.PersonalMaxRiskPerTrade,
        );
        expect(row?.ratio.basisAmount).toBe(personalMaxRiskPerTrade);
        expect(row?.ratio.ratio).toBeCloseTo(
            funded.cushion / personalMaxRiskPerTrade,
            6,
        );
    });

    it('keeps the rulebook basis when a personal max risk per trade is larger than it', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const funded = {
            ...fundedReconstructed(plan, {
                balance: plan.accountSize + documentedRisk * 3,
            }),
            personalMaxRiskPerTrade: documentedRisk * 4,
        };
        const board = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        expect(row?.ratio.fundedRiskBasis).toBe(FundedRiskBasis.RulebookFunded);
        expect(row?.ratio.basisAmount).toBe(documentedRisk);
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
            unavailableEntry('a1', {
                kind: AccountStateUnavailableKind.NoSnapshot,
            }),
        ]);
        expect(board.rows).toEqual([]);
        expect(board.unavailable).toEqual([
            {
                accountId: 'a1',
                reason: { kind: AccountStateUnavailableKind.NoSnapshot },
            },
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
        expect(board.rows.map((row) => row.accountId)).toEqual(['near', 'far']);
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

describe('the cushion board counts the funded risk the way the engine places it (PT-68g, F-V16)', () => {
    it.each([
        ['no personal max risk', null],
        ['a personal max risk below the rulebook risk', 100],
        ['a personal max risk above the rulebook risk', 5000],
    ])('uses the documented funded risk of the engine policy as the funded basis with %s', (_name, personalMaxRiskPerTrade) => {
        const plan = mffProPlan();
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: 40,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        });
        const enginePolicy =
            personalMaxRiskPerTrade === null
                ? policy
                : {
                      ...policy,
                      personalCaps: {
                          ...NO_PERSONAL_CAPS,
                          maxRiskPerTrade: dollars(personalMaxRiskPerTrade),
                      },
                  };
        const funded = {
            ...fundedReconstructed(plan, {
                balance: plan.accountSize + 1000,
            }),
            personalMaxRiskPerTrade,
        };
        const [row] = cushionBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]).rows;

        expect(row?.ratio.basisAmount).toBe(
            documentedFundedRisk(DEFAULT_RULEBOOK, enginePolicy),
        );
    });

    it('reads no rulebook cents of its own for the funded risk', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'lib',
                'prop-accounts',
                'metrics',
                'CushionBoard.ts',
            ),
            'utf8',
        );

        expect(source).not.toContain('funded.riskCents');
    });
});
