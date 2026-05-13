'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';

const VALID_TABS = ['account', 'security', 'trading-plan'] as const;
type TabValue = (typeof VALID_TABS)[number];

function normalize(value: string | null | undefined): TabValue {
    return VALID_TABS.includes(value as TabValue)
        ? (value as TabValue)
        : 'account';
}

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
        <Tabs value={value} onValueChange={onChange} className="">
            <TabsList className="mb-5 flex max-w-md gap-1">
                <TabsTrigger value="account" className="flex-1">
                    Account
                </TabsTrigger>
                <TabsTrigger value="security" className="flex-1">
                    Security
                </TabsTrigger>
                <TabsTrigger value="trading-plan" className="flex-1">
                    Trading Plan
                </TabsTrigger>
            </TabsList>
            <TabsContent value="account" className="space-y-6">
                {accountTab}
            </TabsContent>
            <TabsContent value="security" className="space-y-6">
                {securityTab}
            </TabsContent>
            <TabsContent value="trading-plan" className="space-y-6">
                {tradingPlanTab}
            </TabsContent>
        </Tabs>
    );
}
