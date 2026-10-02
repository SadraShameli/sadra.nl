import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertSubjectView } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AlertsCenter } from '~/app/(app)/prop-calculator/accounts/_components/overview/AlertsCenter';
import { type OverviewAlert } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type AccountAlert,
    AlertKind,
    alertKindLabel,
    AlertSeverity,
    AlertSubjectKind,
} from '~/lib/prop-accounts';

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

function overviewAlertOf(alert: AccountAlert): OverviewAlert {
    const subject = alertSubjectView(alert);
    return {
        disclosures: [],
        key: subject.key,
        kindLabel: alertKindLabel(alert.kind),
        message: alert.message,
        severity: alert.severity,
        subjectLabel: subject.label,
    };
}

function portfolioAlert(
    accountIds: readonly string[],
    message: string,
): AccountAlert {
    return {
        disclosures: [],
        kind: AlertKind.LargeDayLoss,
        message,
        severity: AlertSeverity.Warning,
        subject: { accountIds, kind: AlertSubjectKind.Portfolio },
    };
}

describe('AlertsCenter keys (PT-69b)', () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders two same-kind portfolio alerts without a duplicate React key', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(vi.fn());
        const alerts = [
            portfolioAlert(['alpha', 'bravo'], 'first day loss'),
            portfolioAlert(['alpha', 'bravo'], 'second day loss'),
            portfolioAlert(['charlie'], 'third day loss'),
        ].map((alert) => overviewAlertOf(alert));
        act(() => {
            root.render(<AlertsCenter alerts={alerts} />);
        });
        expect(container.querySelectorAll('li')).toHaveLength(3);
        expect(new Set(alerts.map((alert) => alert.key)).size).toBe(3);
        const duplicateKeyWarnings = errors.mock.calls.filter((call) =>
            String(call[0]).includes('same key'),
        );
        expect(duplicateKeyWarnings).toHaveLength(0);
    });
});
