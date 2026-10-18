import { formatCurrency, NOT_APPLICABLE } from '~/lib/format';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
} from '~/lib/prop-calculator/economics';

export interface RiskDisplayFormatted {
    disclosure: null | string;
    isFallback: boolean;
    label: string;
    text: string;
}

export interface RiskDisplayValues {
    accountDollars: number;
    evAtStake: null | number;
    feeEquivalent: null | number;
}

export function formatRiskDisplay(
    unit: RiskDisplayUnit,
    values: RiskDisplayValues,
): RiskDisplayFormatted {
    switch (unit) {
        case RiskDisplayUnit.AccountDollars: {
            return {
                disclosure: null,
                isFallback: false,
                label: 'Account dollars',
                text: formatCurrency(values.accountDollars),
            };
        }
        case RiskDisplayUnit.EvAtStake: {
            return values.evAtStake === null
                ? {
                      disclosure: feeEquivalentDisclosureOf(
                          values.feeEquivalent,
                      ),
                      isFallback: true,
                      label: 'Fee equivalent (EV at stake unavailable)',
                      text: amountText(values.feeEquivalent),
                  }
                : {
                      disclosure: null,
                      isFallback: false,
                      label: 'EV at stake',
                      text: formatCurrency(values.evAtStake),
                  };
        }
        case RiskDisplayUnit.FeeEquivalent: {
            return {
                disclosure: feeEquivalentDisclosureOf(values.feeEquivalent),
                isFallback: false,
                label: 'Fee equivalent',
                text: amountText(values.feeEquivalent),
            };
        }
    }
}

function amountText(amount: null | number): string {
    return amount === null ? NOT_APPLICABLE : formatCurrency(amount);
}

function feeEquivalentDisclosureOf(amount: null | number): null | string {
    return amount === null
        ? null
        : ECONOMICS_DISCLOSURE_TEXT[
              EconomicsDisclosure.NearFreshEvalApproximation
          ];
}
