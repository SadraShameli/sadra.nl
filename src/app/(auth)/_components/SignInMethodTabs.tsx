'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { cn } from '~/lib/utilities';

import { LoginForm } from '../login/LoginForm';
import { MagicLinkForm } from './MagicLinkForm';

export function SignInMethodTabs() {
    return (
        <Tabs
            className={cn('app-auth__sign-in-tabs', 'flex flex-col gap-3')}
            defaultValue="password"
        >
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="magic">Email link</TabsTrigger>
            </TabsList>
            <TabsContent value="password">
                <LoginForm />
            </TabsContent>
            <TabsContent value="magic">
                <MagicLinkForm />
            </TabsContent>
        </Tabs>
    );
}
