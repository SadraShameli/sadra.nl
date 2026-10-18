export enum BankrollTransferKind {
    Deposit = 'deposit',
    Withdrawal = 'withdrawal',
}

const BANKROLL_TRANSFER_KIND_LABEL: Readonly<
    Record<BankrollTransferKind, string>
> = {
    [BankrollTransferKind.Deposit]: 'Deposit',
    [BankrollTransferKind.Withdrawal]: 'Personal withdrawal',
};

export function bankrollTransferKindLabel(value: BankrollTransferKind): string {
    return BANKROLL_TRANSFER_KIND_LABEL[value];
}
