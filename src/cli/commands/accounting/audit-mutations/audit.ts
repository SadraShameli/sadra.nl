import type { LedgerId } from '~/lib/accounting/core/ids';
import type { RuleSet } from '~/lib/accounting/core/rules/rule-set';
import type { RawTransaction } from '~/lib/accounting/core/types';
import type {
    LedgerResponse,
    MutationResponse,
} from '~/lib/accounting/providers/eboekhouden/schemas';

import { EUR_CODE } from '~/lib/accounting/core/currency';
import { IsoDate } from '~/lib/accounting/core/date';
import {
    isVatCode,
    MutationType,
} from '~/lib/accounting/providers/eboekhouden/enums';

const CASH_DIRECTION: Partial<Record<string, 'IN' | 'OUT'>> = {
    [MutationType.InvoicePaymentReceived]: 'IN',
    [MutationType.InvoicePaymentSent]: 'OUT',
    [MutationType.MoneyReceived]: 'IN',
    [MutationType.MoneySent]: 'OUT',
};

const KNOWN_MUTATION_TYPES = new Set<string>(Object.values(MutationType));

const STOPWORDS = new Set([
    'abonnement',
    'automatisch',
    'betaalverzoek',
    'betaling',
    'card',
    'deze',
    'factuur',
    'from',
    'ideal',
    'incasso',
    'maandelijks',
    'naar',
    'nederland',
    'online',
    'over',
    'overboeking',
    'overschrijving',
    'payment',
    'periodieke',
    'sepa',
    'termijn',
    'the',
    'transactie',
    'transaction',
    'transfer',
    'voor',
    'with',
    'your',
]);

export interface AuditIssue {
    codes: string[];
    message: string;
    mutationIds: string[];
    severity: 'error' | 'warning';
    type: IssueType;
}

export interface AuditReport {
    issues: AuditIssue[];
    matchedByRule: number;
    totalMutations: number;
    unmatched: number;
}

export type IssueType =
    | 'invalid-vat-code'
    | 'rule-drift'
    | 'unexpected-bank-ledger'
    | 'unknown-ledger'
    | 'unknown-mutation-type'
    | 'vendor-conflict';

export interface VendorBreakdownRow {
    combos: { count: number; exampleId: string; label: string }[];
    display: string;
    matched: boolean;
    total: number;
}

interface Classified {
    actualLedgerId: LedgerId | null;
    actualVatCode: null | string;
    expectedLedgerId: LedgerId | null;
    expectedTaxCode: null | string;
    mutation: MutationResponse;
    ruleDisplay: null | string;
    ruleId: null | string;
}

export function auditMutations(input: {
    bankLedgerIds: Set<LedgerId>;
    ledgerById: Map<LedgerId, LedgerResponse>;
    mutations: MutationResponse[];
    ruleSet: RuleSet;
}): AuditReport {
    const { bankLedgerIds, ledgerById, mutations, ruleSet } = input;
    const issues: AuditIssue[] = [];

    for (const m of mutations) {
        if (!ledgerById.has(m.ledgerId)) {
            issues.push({
                codes: [m.ledgerId],
                message: `Mutation ${m.id} (${m.date}) is booked against bank ledger ${m.ledgerId}, which no longer exists in eBoekhouden.`,
                mutationIds: [m.id],
                severity: 'error',
                type: 'unknown-ledger',
            });
        }

        if (!KNOWN_MUTATION_TYPES.has(m.type)) {
            issues.push({
                codes: [m.type],
                message: `Mutation ${m.id} (${m.date}) has an unrecognised mutation type "${m.type}".`,
                mutationIds: [m.id],
                severity: 'error',
                type: 'unknown-mutation-type',
            });
        }

        for (const row of m.rows) {
            if (row.ledgerId && !ledgerById.has(row.ledgerId)) {
                issues.push({
                    codes: [row.ledgerId],
                    message: `Mutation ${m.id} (${m.date}) has a row referencing ledger ${row.ledgerId}, which no longer exists in eBoekhouden.`,
                    mutationIds: [m.id],
                    severity: 'error',
                    type: 'unknown-ledger',
                });
            }
            if (row.vatCode && !isVatCode(row.vatCode)) {
                issues.push({
                    codes: [row.vatCode],
                    message: `Mutation ${m.id} (${m.date}) has row VAT code "${row.vatCode}", which isn't a recognised eBoekhouden VAT code.`,
                    mutationIds: [m.id],
                    severity: 'error',
                    type: 'invalid-vat-code',
                });
            }
        }
    }

    if (bankLedgerIds.size > 0) {
        const byBankLedger = groupBy(
            mutations.filter((m) => !bankLedgerIds.has(m.ledgerId)),
            (m) => m.ledgerId,
        );
        for (const [bankLedgerId, group] of byBankLedger) {
            issues.push({
                codes: [ledgerCode(ledgerById, bankLedgerId)],
                message: `${group.length} mutation(s) (e.g. mutation ${group[0]?.id}) are booked against bank ledger ${ledgerCode(ledgerById, bankLedgerId)}, which isn't among the configured bank accounts for this credential.`,
                mutationIds: group.map((m) => m.id),
                severity: 'warning',
                type: 'unexpected-bank-ledger',
            });
        }
    }

    const classified = classifyMutations(mutations, ruleSet);
    const matchedByRule = classified.filter((c) => c.ruleId).length;

    const byRule = groupBy(
        classified.filter((c) => c.ruleId),
        (c) => c.ruleId,
    );
    for (const group of byRule.values()) {
        const display = group[0]?.ruleDisplay ?? 'unknown rule';
        const conflict = vendorConflictIssue(
            `Vendor "${display}"`,
            group,
            ledgerById,
        );
        if (conflict) {
            issues.push(conflict);
            continue;
        }

        const representative = group[0];
        if (!representative) continue;
        if (representative.expectedLedgerId === null) continue;
        const actual = comboKey(
            representative.actualLedgerId,
            representative.actualVatCode,
        );
        const expected = comboKey(
            representative.expectedLedgerId,
            representative.expectedTaxCode,
        );
        if (actual === expected) continue;
        issues.push({
            codes: [actual, expected],
            message: `Rule "${display}" is configured for ${describeCombo(expected, ledgerById)}, but all ${group.length} matched mutation(s) are consistently booked as ${describeCombo(actual, ledgerById)} instead (e.g. mutation ${representative.mutation.id}) — the rule's ledger/VAT reference looks stale.`,
            mutationIds: group.map((c) => c.mutation.id),
            severity: 'warning',
            type: 'rule-drift',
        });
    }

    const unmatched = classified.filter(
        (c) => !c.ruleId && c.mutation.description,
    );
    const wordMentions = unmatched.flatMap((c) =>
        significantWords(c.mutation.description ?? '').map((word) => ({
            c,
            word,
        })),
    );
    const buckets = groupBy(wordMentions, ({ word }) => word);
    const reportedGroups = new Set<string>();
    for (const [word, entries] of buckets) {
        const group = entries.map(({ c }) => c);
        if (group.length < 2) continue;
        const memberKey = group
            .map((c) => c.mutation.id)
            .toSorted((a, b) => a.localeCompare(b))
            .join(',');
        if (reportedGroups.has(memberKey)) continue;
        const conflict = vendorConflictIssue(
            `Mutations sharing "${word}" in their description (no matching rule)`,
            group,
            ledgerById,
        );
        if (!conflict) continue;
        reportedGroups.add(memberKey);
        issues.push(conflict);
    }

    return {
        issues,
        matchedByRule,
        totalMutations: mutations.length,
        unmatched: mutations.length - matchedByRule,
    };
}

export function buildVendorBreakdown(
    mutations: MutationResponse[],
    ledgerById: Map<LedgerId, LedgerResponse>,
    ruleSet: RuleSet,
): VendorBreakdownRow[] {
    const classified = classifyMutations(mutations, ruleSet);
    const byGroup = groupBy(
        classified,
        (c) =>
            c.ruleId ??
            `unruled:${c.mutation.description ?? '(no description)'}`,
    );
    const rows: VendorBreakdownRow[] = [];
    for (const group of byGroup.values()) {
        const first = group[0];
        if (!first) continue;
        const combos = groupBy(group, (c) =>
            comboKey(c.actualLedgerId, c.actualVatCode),
        );
        rows.push({
            combos: [...combos].map(([key, items]) => ({
                count: items.length,
                exampleId: items[0]?.mutation.id ?? '',
                label: describeCombo(key, ledgerById),
            })),
            display:
                first.ruleDisplay ??
                first.mutation.description ??
                '(no description)',
            matched: first.ruleId !== null,
            total: group.length,
        });
    }
    return rows.toSorted((a, b) => b.total - a.total);
}

function classifyMutations(
    mutations: MutationResponse[],
    ruleSet: RuleSet,
): Classified[] {
    const classified: Classified[] = [];
    for (const m of mutations) {
        const direction = CASH_DIRECTION[m.type];
        const row = m.rows[0];
        const actualLedgerId = row?.ledgerId ?? null;
        const actualVatCode = row?.vatCode ?? null;

        if (!direction || !m.description) {
            classified.push({
                actualLedgerId,
                actualVatCode,
                expectedLedgerId: null,
                expectedTaxCode: null,
                mutation: m,
                ruleDisplay: null,
                ruleId: null,
            });
            continue;
        }

        const amount = m.rows.reduce((sum, r) => sum + Math.abs(r.amount), 0);
        const tx: RawTransaction = {
            date: IsoDate.parse(m.date),
            direction,
            merchant: m.description,
            sourceAmount: amount,
            sourceCurrency: EUR_CODE,
            sourceFee: 0,
            sourceFeeCurrency: null,
            sourceId: m.id,
            txnId: m.id,
        };
        const rule = ruleSet.findMatch(tx);
        classified.push({
            actualLedgerId,
            actualVatCode,
            expectedLedgerId: rule?.ledger.id ?? null,
            expectedTaxCode: rule?.taxCode.toString() ?? null,
            mutation: m,
            ruleDisplay: rule?.display ?? null,
            ruleId: rule?.id ?? null,
        });
    }
    return classified;
}

function comboKey(ledgerId: LedgerId | null, vatCode: null | string): string {
    return `${ledgerId ?? '—'}::${vatCode ?? '—'}`;
}

function describeCombo(
    key: string,
    ledgerById: Map<LedgerId, LedgerResponse>,
): string {
    const [ledgerIdRaw, vatCode] = key.split('::', 2);
    const ledgerLabel =
        ledgerIdRaw && ledgerIdRaw !== '—'
            ? ledgerCode(ledgerById, ledgerIdRaw as LedgerId)
            : '—';
    return `${ledgerLabel} / ${vatCode}`;
}

function groupBy<T, K>(
    items: readonly T[],
    keyFunction: (item: T) => K,
): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    for (const item of items) {
        const key = keyFunction(item);
        const array = groups.get(key) ?? [];
        array.push(item);
        groups.set(key, array);
    }
    return groups;
}

function ledgerCode(
    ledgerById: Map<LedgerId, LedgerResponse>,
    id: LedgerId,
): string {
    const ledger = ledgerById.get(id);
    return ledger ? `${ledger.code} ${ledger.description}` : id;
}

function significantWords(text: string): string[] {
    const words = text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
    return [...new Set(words)];
}

function vendorConflictIssue(
    label: string,
    group: Classified[],
    ledgerById: Map<LedgerId, LedgerResponse>,
): AuditIssue | null {
    const combos = groupBy(group, (c) =>
        comboKey(c.actualLedgerId, c.actualVatCode),
    );
    if (combos.size <= 1) return null;
    const parts = [...combos].map(
        ([key, items]) =>
            `${describeCombo(key, ledgerById)} × ${items.length} (e.g. mutation ${items[0]?.mutation.id})`,
    );
    return {
        codes: combos.keys().toArray(),
        message: `${label} is booked with ${combos.size} different ledger/VAT code combinations: ${parts.join('; ')}.`,
        mutationIds: group.map((c) => c.mutation.id),
        severity: 'warning',
        type: 'vendor-conflict',
    };
}
