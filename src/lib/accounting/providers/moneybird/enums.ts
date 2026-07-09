import type { MoneybirdTaxRate } from '~/lib/accounting/providers/moneybird/schemas';

import {
    BaseTaxCodeCatalog,
    TaxCode,
    type TaxCodeOption,
} from '~/lib/accounting/core/tax-code';

export class MoneybirdTaxCodeCatalog extends BaseTaxCodeCatalog {
    readonly providerId = 'moneybird';

    constructor(private readonly taxRates: readonly MoneybirdTaxRate[]) {
        super();
    }

    protected options(): readonly TaxCodeOption[] {
        return this.taxRates.map((rate) => ({
            code: TaxCode.of(rate.id),
            label: `${rate.name} (${rate.percentage}%)`,
        }));
    }
}
