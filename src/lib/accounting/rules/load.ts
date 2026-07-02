import { and, asc, eq } from 'drizzle-orm';
import 'server-only';

import { Rule } from '~/lib/accounting/core/rules/rule';
import { RuleSet } from '~/lib/accounting/core/rules/rule-set';
import { accountingRule, db } from '~/server/db';

export async function loadRuleSet(
    credentialId: string | undefined,
    userId: string,
): Promise<RuleSet> {
    if (!credentialId) return new RuleSet([]);
    const rows = await db
        .select()
        .from(accountingRule)
        .where(
            and(
                eq(accountingRule.credentialId, credentialId),
                eq(accountingRule.userId, userId),
            ),
        )
        .orderBy(asc(accountingRule.sortOrder));
    return new RuleSet(rows.map(toRule));
}

export function toRule(row: typeof accountingRule.$inferSelect): Rule {
    return Rule.fromRow({
        currency: row.currency,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        direction: row.direction,
        display: row.display,
        id: row.id,
        ledger: { id: row.ledgerId, label: row.ledgerLabel },
        match: row.match,
        matchType: row.matchType,
        maxAmount: row.maxAmount,
        minAmount: row.minAmount,
        taxCode: row.vatCode,
    });
}
