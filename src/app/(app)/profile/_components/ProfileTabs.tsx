'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { cn } from '~/lib/utils';

const VALID_TABS = [
    'account',
    'security',
    'sensor-hub',
    'trading-plan',
] as const;
type TabValue = (typeof VALID_TABS)[number];

export function ProfileTabs({
    accountTab,
    securityTab,
    sensorHubTab,
    tradingPlanTab,
}: {
    accountTab: ReactNode;
    securityTab: ReactNode;
    sensorHubTab?: ReactNode;
    tradingPlanTab: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [value, setValue] = useState<TabValue>(() =>
        normalize(searchParams.get('tab'), !!sensorHubTab),
    );

    useEffect(() => {
        setValue(normalize(searchParams.get('tab'), !!sensorHubTab));
    }, [searchParams, sensorHubTab]);

    const onChange = useCallback(
        (next: string) => {
            const v = normalize(next, !!sensorHubTab);
            setValue(v);
            const sp = new URLSearchParams(searchParams.toString());
            sp.set('tab', v);
            router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams, sensorHubTab],
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
                    'mb-5 flex w-full gap-1',
                    sensorHubTab ? 'sm:max-w-2xl' : 'sm:max-w-md',
                )}
            >
                <TabsTrigger className="flex-1" value="account">
                    Account
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="security">
                    Security
                </TabsTrigger>
                {sensorHubTab && (
                    <TabsTrigger className="flex-1" value="sensor-hub">
                        Sensor Hub
                    </TabsTrigger>
                )}
                <TabsTrigger className="flex-1" value="trading-plan">
                    Trading Plan
                </TabsTrigger>
            </TabsList>
            <TabsContent className="flex flex-col gap-6" value="account">
                {accountTab}
            </TabsContent>
            <TabsContent className="flex flex-col gap-6" value="security">
                {securityTab}
            </TabsContent>
            {sensorHubTab && (
                <TabsContent className="flex flex-col gap-6" value="sensor-hub">
                    {sensorHubTab}
                </TabsContent>
            )}
            <TabsContent className="flex flex-col gap-6" value="trading-plan">
                {tradingPlanTab}
            </TabsContent>
        </Tabs>
    );
}

function normalize(
    value: null | string | undefined,
    hasSensorHub: boolean,
): TabValue {
    if (value === 'sensor-hub' && !hasSensorHub) return 'account';
    return VALID_TABS.includes(value as TabValue)
        ? (value as TabValue)
        : 'account';
}
