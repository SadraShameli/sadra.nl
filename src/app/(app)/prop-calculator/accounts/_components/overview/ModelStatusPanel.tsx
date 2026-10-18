import { type LucideIcon } from 'lucide-react';

import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';

import { ExpectedNetStatus } from './overviewModel';
import {
    OverviewComputingPanel,
    OverviewEmptyPanel,
    OverviewPanel,
} from './OverviewPanel';
import { type OverviewSectionId } from './overviewSections';

export function ModelFailureNote({
    status,
    statusNote,
}: {
    readonly status: ExpectedNetStatus;
    readonly statusNote: null | string;
}) {
    return statusNote !== null && status === ExpectedNetStatus.Failed ? (
        <QueryErrorNotice message={statusNote} />
    ) : null;
}

export function ModelStatusPanel({
    emptyTitle,
    icon,
    section,
    status,
    statusNote,
}: {
    readonly emptyTitle: string;
    readonly icon: LucideIcon;
    readonly section: OverviewSectionId;
    readonly status: ExpectedNetStatus;
    readonly statusNote: null | string;
}) {
    switch (status) {
        case ExpectedNetStatus.Failed: {
            return (
                <OverviewPanel section={section}>
                    <ModelFailureNote status={status} statusNote={statusNote} />
                </OverviewPanel>
            );
        }
        case ExpectedNetStatus.NoPlans:
        case ExpectedNetStatus.Ready: {
            return (
                <OverviewEmptyPanel
                    description={statusNote ?? undefined}
                    icon={icon}
                    section={section}
                    title={emptyTitle}
                />
            );
        }
        case ExpectedNetStatus.Pending: {
            return <OverviewComputingPanel section={section} />;
        }
    }
}
