import { describe, expect, it } from 'vitest';

import {
    externalFirmNameError,
    firmKeyOfOption,
    LedgerOnlyFirmGroup,
    ledgerOnlyFirmOptions,
    ledgerOnlyPlanLabel,
} from '~/app/(app)/prop-calculator/accounts/_components/externalFirmOptions';
import { firmKeyId, FirmKeyKind } from '~/lib/prop-accounts';
import { ALL_FIRMS, FirmId } from '~/lib/prop-calculator';
import { MAX_ACCOUNT_LABEL_LENGTH } from '~/lib/schemas/propAccounts';

const HOLA = { id: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b', name: 'Hola Prime' };
const SEAT = {
    id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6',
    name: 'funded Seat',
};

describe('ledgerOnlyFirmOptions', () => {
    it('lists every listed firm first, then the caller own firms by name', () => {
        const options = ledgerOnlyFirmOptions([HOLA, SEAT]);
        expect(
            options
                .filter((option) => option.group === LedgerOnlyFirmGroup.Listed)
                .map((option) => option.label),
        ).toEqual(ALL_FIRMS.map((firm) => firm.displayName));
        expect(
            options
                .filter((option) => option.group === LedgerOnlyFirmGroup.Own)
                .map((option) => option.label),
        ).toEqual(['funded Seat', 'Hola Prime']);
        expect(options.at(-1)?.group).toBe(LedgerOnlyFirmGroup.Own);
    });

    it('keys every option by its firm key, so a listed firm and an own firm never share a value', () => {
        const options = ledgerOnlyFirmOptions([HOLA]);
        const values = options.map((option) => option.value);
        expect(new Set(values).size).toBe(values.length);
        expect(values).toContain(
            firmKeyId({ firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled }),
        );
        expect(values).toContain(
            firmKeyId({ externalFirmId: HOLA.id, kind: FirmKeyKind.External }),
        );
    });
});

describe('firmKeyOfOption', () => {
    it('reads an option value back into its firm key, and nothing for an unknown value', () => {
        const options = ledgerOnlyFirmOptions([HOLA]);
        const own = options.find(
            (option) => option.group === LedgerOnlyFirmGroup.Own,
        );
        expect(firmKeyOfOption(options, own?.value ?? '')).toEqual({
            externalFirmId: HOLA.id,
            kind: FirmKeyKind.External,
        });
        expect(
            firmKeyOfOption(
                options,
                firmKeyId({ firmId: FirmId.Lucid, kind: FirmKeyKind.Modeled }),
            ),
        ).toEqual({ firmId: FirmId.Lucid, kind: FirmKeyKind.Modeled });
        expect(firmKeyOfOption(options, 'external:someone-else')).toBeNull();
        expect(firmKeyOfOption(options, '')).toBeNull();
    });
});

describe('externalFirmNameError', () => {
    it('accepts a new name and trims it', () => {
        expect(externalFirmNameError('  Tradeday  ', [HOLA])).toBeNull();
    });

    it('rejects a blank name, a name over the label limit and one of your firms again, ignoring letter case', () => {
        expect(externalFirmNameError(' '.repeat(3), [])).toBe(
            'Enter the firm name.',
        );
        expect(
            externalFirmNameError('x'.repeat(MAX_ACCOUNT_LABEL_LENGTH + 1), []),
        ).toBe(
            `Keep the firm name to ${MAX_ACCOUNT_LABEL_LENGTH} characters or fewer.`,
        );
        expect(externalFirmNameError('hola PRIME', [HOLA])).toBe(
            'One of your firms already has this name.',
        );
    });

    it('rejects a name that a listed firm already has, so the listed firm is picked instead', () => {
        const listed = ALL_FIRMS[0];
        expect(
            externalFirmNameError(listed?.displayName.toUpperCase() ?? '', []),
        ).toBe(
            `${listed?.displayName ?? ''} is a listed firm; pick it from the list instead.`,
        );
    });
});

describe('ledgerOnlyPlanLabel', () => {
    const [plan] = ALL_FIRMS.flatMap((firm) => firm.plans);

    it('swaps the size in a registry label for the size the engine does not model', () => {
        if (plan === undefined) throw new Error('no plan');
        expect(plan.id.accountSize).toBe(50_000);
        expect(plan.label.startsWith('$50K · ')).toBe(true);
        expect(ledgerOnlyPlanLabel(plan, 150_000)).toBe(
            plan.label.replace('$50K · ', '$150K · '),
        );
        expect(ledgerOnlyPlanLabel(plan, 50_000)).toBe(plan.label);
    });

    it('appends the size to a label that does not start with its own size', () => {
        if (plan === undefined) throw new Error('no plan');
        const renamed = plan.withOverrides({ label: 'Flex' });
        expect(ledgerOnlyPlanLabel(renamed, 75_500)).toBe('Flex at $75.5K');
    });
});
