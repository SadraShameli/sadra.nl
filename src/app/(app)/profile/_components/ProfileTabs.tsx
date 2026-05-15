'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { cn } from '~/lib/utils';

const VALID_TABS = ['account', 'security', 'trading-plan'] as const;
type TabValue = (typeof VALID_TABS)[number];

export function ProfileTabs({
    accountTab,
    securityTab,
    tradingPlanTab,
}: {
    accountTab: ReactNode;
    securityTab: ReactNode;
    tradingPlanTab: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [value, setValue] = useState<TabValue>(() =>
        normalize(searchParams.get('tab')),
    );

    useEffect(() => {
        setValue(normalize(searchParams.get('tab')));
    }, [searchParams]);

    const onChange = useCallback(
        (next: string) => {
            const v = normalize(next);
            setValue(v);
            const sp = new URLSearchParams(searchParams.toString());
            sp.set('tab', v);
            router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    return (
        <Tabs
            className={'app-profile__tabs'}
            onValueChange={onChange}
            value={value}
        >
            <TabsList
                className={cn(
                    'app-profile__tabs-list',
                    'mb-5 flex max-w-md gap-1',
                )}
            >
                <TabsTrigger className="flex-1" value="account">
                    Account
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="security">
                    Security
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="trading-plan">
                    Trading Plan
                </TabsTrigger>
            </TabsList>
            <TabsContent className="space-y-6" value="account">
                {accountTab}
            </TabsContent>
            <TabsContent className="space-y-6" value="security">
                {securityTab}
            </TabsContent>
            <TabsContent className="space-y-6" value="trading-plan">
                {tradingPlanTab}
            </TabsContent>
        </Tabs>
    );
}

function normalize(value: null | string | undefined): TabValue {
    return VALID_TABS.includes(value as TabValue)
        ? (value as TabValue)
        : 'account';
}
