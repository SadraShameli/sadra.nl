import { ChartNoAxesColumn } from 'lucide-react';

import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

export function ChartEmptyState({ title }: { readonly title: string }) {
    return (
        <EmptyState
            icon={ChartNoAxesColumn}
            size={EmptyStateSize.Compact}
            title={title}
        />
    );
}
