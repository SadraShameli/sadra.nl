export abstract class AccountingProviderError extends Error {
    protected constructor(message: string) {
        super(message);
    }
}
