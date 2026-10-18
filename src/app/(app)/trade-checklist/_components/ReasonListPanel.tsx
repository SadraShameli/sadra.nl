import { ArrowRight, ListChecks } from 'lucide-react';

import { ToolPanel } from '~/components/ToolPanel';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

export function ReasonList({ items }: { readonly items: readonly string[] }) {
    return (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm text-foreground">
            {items.map((item) => (
                <li className="flex items-start gap-2.5" key={item}>
                    <ArrowRight
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-ink-muted"
                    />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

export function ReasonListPanel({
    className,
    emptyText,
    items,
    title,
}: {
    readonly className?: string;
    readonly emptyText?: string;
    readonly items: readonly string[];
    readonly title: string;
}) {
    return (
        <ToolPanel className={className} title={title}>
            {items.length > 0 ? (
                <ReasonList items={items} />
            ) : (
                <EmptyState
                    icon={ListChecks}
                    size={EmptyStateSize.Compact}
                    title={emptyText}
                />
            )}
        </ToolPanel>
    );
}
