'use client';

import { type ReactNode, startTransition, useState } from 'react';

import { PageTransition } from '~/components/PageTransition';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { cn } from '~/lib/utilities';

export type ProfileSubTab<TValue extends string> = {
    content: ReactNode;
    label: string;
    value: TValue;
};

export function ProfileSubTabs<TValue extends string>({
    className,
    defaultValue,
    tabs,
}: {
    className?: string;
    defaultValue: TValue;
    tabs: readonly ProfileSubTab<TValue>[];
}) {
    const [value, setValue] = useState<TValue>(defaultValue);
    const selectTab = (next: string) => {
        const tab = tabs.find((candidate) => candidate.value === next);
        if (tab === undefined) return;
        startTransition(() => setValue(tab.value));
    };

    return (
        <Tabs
            className={cn('flex min-w-0 flex-col gap-4', className)}
            onValueChange={selectTab}
            value={value}
        >
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
                <TabsList className="inline-flex w-max justify-start">
                    {tabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {tabs.map((tab) => (
                <TabsContent
                    className="mt-0 min-w-0"
                    key={tab.value}
                    value={tab.value}
                >
                    <PageTransition>{tab.content}</PageTransition>
                </TabsContent>
            ))}
        </Tabs>
    );
}
