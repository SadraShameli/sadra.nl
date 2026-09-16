import type {
    RawTransaction,
    TransactionMatch,
} from '~/lib/accounting/core/types';

import { type Rule } from '~/lib/accounting/core/rules/rule';

export class RuleSet {
    constructor(private readonly rules: readonly Rule[]) {}

    classify(tx: RawTransaction): null | TransactionMatch {
        const rule = this.findMatch(tx);
        return rule
            ? {
                  display: rule.display,
                  ledgerId: rule.ledger.id,
                  ledgerLabel: rule.ledger.label,
              }
            : null;
    }

    findMatch(tx: RawTransaction): null | Rule {
        const effectiveTx = tx.isRefund
            ? { ...tx, direction: 'OUT' as const }
            : tx;
        for (const rule of this.rules) {
            if (rule.matches(effectiveTx)) return rule;
        }
        return null;
    }
}
