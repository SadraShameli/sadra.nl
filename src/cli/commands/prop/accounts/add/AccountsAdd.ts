import type { PropAccountsCaller } from '~/cli/commands/prop/accounts/PropAccountsCaller';

import {
    type AccountStage,
    type FeeKind,
    feePrefillCents,
    feePrefillDefaultKind,
    type UsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DashboardBalanceConvention } from '~/lib/prop-calculator/advisor';

export enum FeeChoiceKind {
    Amount = 'amount',
    List = 'list',
    None = 'none',
}

export type AccountFeeInput = Parameters<
    PropAccountsCaller['fee']['create']
>[0];

export type AccountImportRows = Parameters<
    PropAccountsCaller['account']['importMany']
>[0];

export interface AccountsAddPort {
    createFee(input: AccountFeeInput): Promise<void>;
    existingLabels(): Promise<readonly string[]>;
    importAccounts(rows: AccountImportRows): Promise<readonly CreatedAccount[]>;
}

export interface AccountsAddRequest {
    readonly count: number;
    readonly fee: FeeChoice;
    readonly fundedOn: null | string;
    readonly label: string;
    readonly plan: Plan;
    readonly purchasedOn: string;
    readonly stage: AccountStage;
}

export interface AddedAccount {
    readonly fee: null | {
        readonly amountCents: UsdCents;
        readonly kind: FeeKind;
    };
    readonly id: string;
    readonly label: string;
    readonly planSerial: null | string;
    readonly stage: AccountStage;
}

export type FeeChoice =
    | { readonly cents: UsdCents; readonly kind: FeeChoiceKind.Amount }
    | { readonly kind: FeeChoiceKind.List }
    | { readonly kind: FeeChoiceKind.None };

interface CreatedAccount {
    readonly id: string;
    readonly label: string;
    readonly planSerial: null | string;
    readonly stage: AccountStage;
}

const NAMED_FEE_CHOICES: ReadonlyMap<string, FeeChoice> = new Map([
    [FeeChoiceKind.List, { kind: FeeChoiceKind.List }],
    [FeeChoiceKind.None, { kind: FeeChoiceKind.None }],
]);

export class NoListPriceError extends Error {
    constructor(planLabel: string) {
        super(
            `${planLabel} has no list price for its default fee kind; pass --fee none or --fee <dollars>`,
        );
    }
}

export function accountsAddPortOf(caller: PropAccountsCaller): AccountsAddPort {
    return {
        createFee: async (input) => {
            await caller.fee.create(input);
        },
        existingLabels: async () => {
            const accounts = await caller.account.list({});
            return accounts.map((account) => account.label);
        },
        importAccounts: (rows) => caller.account.importMany(rows),
    };
}

export async function addAccounts(
    port: AccountsAddPort,
    request: AccountsAddRequest,
): Promise<readonly AddedAccount[]> {
    const fee = feeFor(request.plan, request.fee);
    const labels = nextAccountLabels(
        request.label,
        request.count,
        new Set(await port.existingLabels()),
    );
    const created = await port.importAccounts(
        labels.map((label) => ({
            accountSize: request.plan.accountSize,
            dashboardConvention: DashboardBalanceConvention.Nominal,
            firmId: request.plan.id.firm,
            fundedOn: request.fundedOn,
            label,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(request.plan.id),
            purchasedOn: request.purchasedOn,
            stage: request.stage,
        })),
    );
    const added: AddedAccount[] = [];
    for (const account of created) {
        if (fee !== null) {
            await port.createFee({
                accountId: account.id,
                amountCents: fee.amountCents,
                kind: fee.kind,
                paidOn: request.purchasedOn,
            });
        }
        added.push({
            fee,
            id: account.id,
            label: account.label,
            planSerial: account.planSerial,
            stage: account.stage,
        });
    }
    return added;
}

export function nextAccountLabels(
    base: string,
    count: number,
    taken: ReadonlySet<string>,
): readonly string[] {
    const labels: string[] = [];
    for (let index = 1; labels.length < count; index++) {
        const label = `${base} ${String(index)}`;
        if (!taken.has(label)) labels.push(label);
    }
    return labels;
}

export function readFeeChoice(raw: string): FeeChoice {
    const value = raw.trim().toLowerCase();
    const named = NAMED_FEE_CHOICES.get(value);
    if (named !== undefined) return named;
    const dollars = Number(value);
    if (value === '' || !Number.isFinite(dollars) || dollars < 0) {
        throw new Error(
            `--fee must be list, none or a dollar amount >= 0, got "${raw}"`,
        );
    }
    return { cents: usdCentsFromDollars(dollars), kind: FeeChoiceKind.Amount };
}

function feeFor(plan: Plan, choice: FeeChoice): AddedAccount['fee'] {
    const kind = feePrefillDefaultKind(plan);
    switch (choice.kind) {
        case FeeChoiceKind.Amount: {
            return { amountCents: choice.cents, kind };
        }
        case FeeChoiceKind.List: {
            const amountCents = feePrefillCents(plan, kind);
            if (amountCents === null) throw new NoListPriceError(plan.label);
            return { amountCents, kind };
        }
        case FeeChoiceKind.None: {
            return null;
        }
    }
}
