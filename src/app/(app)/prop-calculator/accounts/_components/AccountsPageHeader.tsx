import { type ReactNode } from 'react';

export function AccountsPageHeader({
    action,
    description,
    title,
}: {
    readonly action?: ReactNode;
    readonly description?: ReactNode;
    readonly title: string;
}) {
    return (
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {title}
                </h1>
                {description !== undefined && (
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
                        {description}
                    </p>
                )}
            </div>
            {action !== undefined && <div className="shrink-0">{action}</div>}
        </header>
    );
}
