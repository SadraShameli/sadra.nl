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

export abstract class BaseTaxCodeCatalog implements TaxCodeCatalog {
    abstract readonly providerId: string;

    labelOf(code: TaxCode): string {
        return (
            this.options().find((option) => option.code.equals(code))?.label ??
            code.toString()
        );
    }

    list(): readonly TaxCodeOption[] {
        return this.options();
    }

    validate(code: TaxCode): boolean {
        return this.options().some((option) => option.code.equals(code));
    }

    protected abstract options(): readonly TaxCodeOption[];
}

export class TaxCode {
    static of(value: string): TaxCode {
        if (value.trim().length === 0) {
            throw new Error('TaxCode value must not be empty');
        }
        return new TaxCode(value);
    }

    private constructor(private readonly value: string) {}

    equals(other: TaxCode): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}
