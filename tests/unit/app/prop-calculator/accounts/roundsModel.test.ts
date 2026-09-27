import { describe, expect, it } from 'vitest';

import {
    firmColumnsFromSelectValue,
    firmSelectOptions,
    roundsPageModel,
} from '~/app/(app)/prop-calculator/accounts/rounds/roundsModel';
import { firmKeyId, FirmKeyKind, RoundStatus, usdCents } from '~/lib/prop-accounts';
import { findFirm, FirmId } from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    round,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const THRESHOLDS = {
    minClosedRounds: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

const HOLA = { id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', name: 'Hola Prime' };
const ATLAS = { id: '7c2d9e4f-3a1b-4c5d-8e6f-9a0b1c2d3e4f', name: 'Atlas Prop' };

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
        expect(firmColumnsFromSelectValue('modeled:not-a-real-firm')).toBeNull();
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
        );
        expect(model.suggestions).toEqual([]);
    });
});
