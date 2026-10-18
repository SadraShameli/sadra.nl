import { formatGateCurrency } from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import {
    type BankrollMinimumBudget,
    type Quantity,
} from '~/lib/prop-calculator/economics';

export enum BankrollBudgetCheckKind {
    NotChecked = 'not-checked',
    Short = 'short',
    Sufficient = 'sufficient',
}

export type BankrollBudgetCheck =
    | BankrollBudgetShort
    | {
          readonly kind:
              | BankrollBudgetCheckKind.NotChecked
              | BankrollBudgetCheckKind.Sufficient;
      };

export interface BankrollBudgetShort {
    readonly attempts: number;
    readonly kind: BankrollBudgetCheckKind.Short;
    readonly minimumBudget: Dollars;
}

export function bankrollBudgetCheck(
    budget: Dollars | null,
    minimumBudget: Quantity<BankrollMinimumBudget>,
): BankrollBudgetCheck {
    if (budget === null || minimumBudget.value === null) {
        return { kind: BankrollBudgetCheckKind.NotChecked };
    }
    return budget < minimumBudget.value.budget
        ? {
              attempts: minimumBudget.value.attempts,
              kind: BankrollBudgetCheckKind.Short,
              minimumBudget: minimumBudget.value.budget,
          }
        : { kind: BankrollBudgetCheckKind.Sufficient };
}

export function bankrollBudgetShortText(check: BankrollBudgetShort): string {
    const noun = check.attempts === 1 ? 'attempt' : 'attempts';
    return `you need at least ${formatGateCurrency(check.minimumBudget)} (${String(check.attempts)} ${noun}) at this plan for your threshold`;
}
