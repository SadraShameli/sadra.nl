export interface TaxCodeCatalog {
    labelOf(code: TaxCode): string;
    list(): readonly TaxCodeOption[];
    readonly providerId: string;
    validate(code: TaxCode): boolean;
}

export interface TaxCodeOption {
    readonly code: TaxCode;
    readonly label: string;
}

export class TaxCode {
    private constructor(private readonly value: string) {}

    static of(value: string): TaxCode {
        if (value.trim().length === 0) {
            throw new Error('TaxCode value must not be empty');
        }
        return new TaxCode(value);
    }

    equals(other: TaxCode): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}
