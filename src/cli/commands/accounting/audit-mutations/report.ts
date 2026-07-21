import { ui } from '~/cli/ui';

import type {
    AuditIssue,
    AuditReport,
    IssueType,
    VendorBreakdownRow,
} from './audit';

const ISSUE_LABEL: Record<IssueType, string> = {
    'invalid-vat-code': 'Invalid VAT codes',
    'rule-drift': 'Bookings that drifted from their matching rule',
    'unexpected-bank-ledger': 'Mutations on an unexpected bank ledger',
    'unknown-ledger': 'References to ledgers that no longer exist',
    'unknown-mutation-type': 'Unrecognised mutation types',
    'vendor-conflict': 'Same vendor booked with conflicting codes',
};

const ISSUE_ORDER: IssueType[] = [
    'invalid-vat-code',
    'unknown-ledger',
    'unknown-mutation-type',
    'vendor-conflict',
    'rule-drift',
    'unexpected-bank-ledger',
];

export function printBreakdown(rows: VendorBreakdownRow[]): void {
    ui.heading(`Full vendor/rule breakdown (${rows.length} group(s))`);
    for (const row of rows) {
        const tag = row.matched ? '' : ' [no matching rule]';
        ui.note(`${row.display}${tag} — ${row.total} mutation(s)`);
        for (const combo of row.combos) {
            ui.muted(
                `    ${combo.label} × ${combo.count} (e.g. mutation ${combo.exampleId})`,
            );
        }
    }
}

export function printReport(report: AuditReport): void {
    ui.heading('Summary');
    ui.note(`${report.totalMutations} mutation(s) audited`);
    ui.note(
        `${report.matchedByRule} matched an existing rule, ${report.unmatched} did not`,
    );

    if (report.issues.length === 0) {
        ui.success('No issues found.');
        return;
    }

    const errors = report.issues.filter((index) => index.severity === 'error');
    const warnings = report.issues.filter(
        (index) => index.severity === 'warning',
    );
    ui.warn(
        `${report.issues.length} issue(s) found — ${errors.length} error(s), ${warnings.length} warning(s)`,
    );

    const byType = new Map<IssueType, AuditIssue[]>();
    for (const issue of report.issues) {
        const array = byType.get(issue.type) ?? [];
        array.push(issue);
        byType.set(issue.type, array);
    }

    for (const type of ISSUE_ORDER) {
        const issues = byType.get(type);
        if (!issues || issues.length === 0) continue;
        ui.heading(`${ISSUE_LABEL[type]} (${issues.length})`);
        for (const issue of issues) {
            if (issue.severity === 'error') ui.fail(issue.message);
            else ui.warn(issue.message);
        }
    }
}
