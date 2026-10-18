'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, startTransition, useState } from 'react';

import { PageTransition } from '~/components/PageTransition';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { cn } from '~/lib/utilities';

export type PageTab<TValue extends string> = {
    content: ReactNode;
    label: string;
    value: TValue;
};

export function PageTabs<TValue extends string>({
    className,
    defaultValue,
    onValueChange,
    tabs,
    value: controlledValue,
}: {
    className?: string;
    defaultValue: TValue;
    onValueChange?: (value: TValue) => void;
    tabs: readonly PageTab<TValue>[];
    value?: TValue;
}) {
    const [uncontrolledValue, setUncontrolledValue] =
        useState<TValue>(defaultValue);
    const value = controlledValue ?? uncontrolledValue;
    const selectTab = (next: string) => {
        const tab = tabs.find((candidate) => candidate.value === next);
        if (tab === undefined) return;
        startTransition(() => {
            setUncontrolledValue(tab.value);
            onValueChange?.(tab.value);
        });
    };

    return (
        <Tabs
            activationMode="manual"
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

export function UrlPageTabs<TValue extends string>({
    className,
    defaultValue,
    searchParameter,
    tabs,
}: {
    className?: string;
    defaultValue: TValue;
    searchParameter: string;
    tabs: readonly PageTab<TValue>[];
}) {
    const router = useRouter();
    const searchParameters = useSearchParams();
    const requested = searchParameters.get(searchParameter);
    const value =
        tabs.find((tab) => tab.value === requested)?.value ?? defaultValue;
    return (
        <PageTabs
            className={className}
            defaultValue={defaultValue}
            onValueChange={(next) => {
                const query = new URLSearchParams(searchParameters.toString());
                if (next === defaultValue) query.delete(searchParameter);
                else query.set(searchParameter, next);
                const search = query.toString();
                router.replace(`?${search}`, { scroll: false });
            }}
            tabs={tabs}
            value={value}
        />
    );
}
