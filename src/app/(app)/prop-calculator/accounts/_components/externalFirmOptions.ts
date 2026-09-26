import { formatCompactCurrency } from '~/lib/format';
import {
    type ExternalFirmName,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';
import { externalFirmCreateSchema } from '~/lib/schemas/propAccounts';

export enum LedgerOnlyFirmGroup {
    Listed = 'listed',
    Own = 'own',
}

export interface LedgerOnlyFirmOption {
    readonly firmKey: FirmKey;
    readonly group: LedgerOnlyFirmGroup;
    readonly label: string;
    readonly value: string;
}

const NAME_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });
const SIZE_SEPARATOR = ' · ';
const NAME_REQUIRED = 'Enter the firm name.';
const NAME_TAKEN = 'One of your firms already has this name.';

export function externalFirmNameError(
    name: string,
    externalFirms: readonly ExternalFirmName[],
): null | string {
    const parsed = externalFirmCreateSchema.shape.name.safeParse(name);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        if (issue === undefined || issue.code === 'too_small') {
            return NAME_REQUIRED;
        }
        return issue.code === 'too_big'
            ? `Keep the firm name to ${String(issue.maximum)} characters or fewer.`
            : `The firm name ${issue.message}.`;
    }
    const listed = ALL_FIRMS.find(
        (firm) => NAME_COLLATOR.compare(firm.displayName, parsed.data) === 0,
    );
    if (listed !== undefined) {
        return `${listed.displayName} is a listed firm; pick it from the list instead.`;
    }
    return externalFirms.some(
        (firm) => NAME_COLLATOR.compare(firm.name, parsed.data) === 0,
    )
        ? NAME_TAKEN
        : null;
}

export function firmKeyOfOption(
    options: readonly LedgerOnlyFirmOption[],
    value: string,
): FirmKey | null {
    return options.find((option) => option.value === value)?.firmKey ?? null;
}

export function ledgerOnlyFirmOptions(
    externalFirms: readonly ExternalFirmName[],
): readonly LedgerOnlyFirmOption[] {
    const listed = ALL_FIRMS.map((firm) =>
        optionOf(
            { firmId: firm.id, kind: FirmKeyKind.Modeled },
            LedgerOnlyFirmGroup.Listed,
            firm.displayName,
        ),
    );
    const own = externalFirms
        .toSorted((a, b) => NAME_COLLATOR.compare(a.name, b.name))
        .map((firm) =>
            optionOf(
                { externalFirmId: firm.id, kind: FirmKeyKind.External },
                LedgerOnlyFirmGroup.Own,
                firm.name,
            ),
        );
    return [...listed, ...own];
}

export function ledgerOnlyPlanLabel(plan: Plan, accountSize: number): string {
    if (accountSize === plan.id.accountSize) return plan.label;
    const ownPrefix = `${formatCompactCurrency(plan.id.accountSize)}${SIZE_SEPARATOR}`;
    const size = formatCompactCurrency(accountSize);
    return plan.label.startsWith(ownPrefix)
        ? `${size}${SIZE_SEPARATOR}${plan.label.slice(ownPrefix.length)}`
        : `${plan.label} at ${size}`;
}

function optionOf(
    firmKey: FirmKey,
    group: LedgerOnlyFirmGroup,
    label: string,
): LedgerOnlyFirmOption {
    return { firmKey, group, label, value: firmKeyId(firmKey) };
}
