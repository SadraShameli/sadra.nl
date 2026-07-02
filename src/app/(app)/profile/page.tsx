import { and, desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { type ReactNode } from 'react';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { isAdminOrAbove, isRoot, resolveRole } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { profileSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { ensureUserHasPlan } from '~/lib/trading/actions';
import { cn } from '~/lib/utils';
import { account, db, tradingPlans } from '~/server/db';
import { api, HydrateClient } from '~/trpc/server';

import { AccountManagement } from './_components/AccountManagement';
import { DeleteAccountDialog } from './_components/DeleteAccountDialog';
import { LiftingHub } from './_components/lifting/LiftingHub';
import { ProfileNav } from './_components/ProfileNav';
import {
    normalizeProfileTab,
    type ProfileTabValue,
} from './_components/profileTabs';
import { SensorHubTab } from './_components/SensorHubTab';
import { SessionsList } from './_components/SessionsList';
import { TradingPlanTab } from './_components/TradingPlanTab';
import { UpdateNameForm } from './_components/UpdateNameForm';
import { UpdatePasswordForm } from './_components/UpdatePasswordForm';

export const metadata: Metadata = {
    description: 'Manage your account, sessions and trading plan.',
    robots: { follow: false, index: false },
    title: 'Profile · sadra.nl',
};

const TAB_TITLES: Record<ProfileTabValue, string> = {
    account: 'Account',
    lifting: 'Lifting',
    'sensor-hub': 'Sensor Hub',
    trading: 'Trading',
    users: 'Users',
};

const PW_MESSAGES: Record<string, string> = {
    email_taken: 'That email is already in use by another account.',
    pw_fail: 'Could not update password.',
    pw_wrong: 'Current password is incorrect.',
};

export default async function ProfilePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);

    const rawParameters = await searchParams;
    const { error, success } = profileSearchSchema.parse(rawParameters);

    const [credentialAccount] = await db
        .select({ password: account.password })
        .from(account)
        .where(
            and(
                eq(account.userId, session.user.id),
                eq(account.providerId, 'credential'),
            ),
        )
        .limit(1);
    const hasPassword = Boolean(credentialAccount?.password);

    await ensureUserHasPlan();

    const plans = await db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, session.user.id))
        .orderBy(tradingPlans.sortOrder, desc(tradingPlans.updatedAt));

    const { email, name } = session.user;
    const role = resolveRole(email, session.user.role);
    const isAdmin = isAdminOrAbove(role);
    const isUserIsRoot = isRoot(role);
    const activeTab = normalizeProfileTab(rawParameters.tab, isAdmin);

    const prefetches: Promise<unknown>[] = [];
    if (isAdmin) {
        prefetches.push(
            api.device.listAdmin.prefetch(),
            api.location.listAdmin.prefetch(),
            api.sensor.listAdmin.prefetch(),
            api.user.notification.getMyPrefs.prefetch(),
        );
    }
    await Promise.all(prefetches);

    const accountTab: ReactNode = (
        <>
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {success === 'name' && (
                            <Alert autoDismiss variant="success">
                                <AlertDescription>
                                    Name updated successfully.
                                </AlertDescription>
                            </Alert>
                        )}
                        {success === 'email' && (
                            <Alert autoDismiss variant="success">
                                <AlertDescription>
                                    Email updated successfully.
                                </AlertDescription>
                            </Alert>
                        )}
                        <UpdateNameForm currentName={name} email={email} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Password</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {error && PW_MESSAGES[error] && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {PW_MESSAGES[error]}
                                </AlertDescription>
                            </Alert>
                        )}
                        {success === 'password' && (
                            <Alert autoDismiss variant="success">
                                <AlertDescription>
                                    Password changed successfully.
                                </AlertDescription>
                            </Alert>
                        )}
                        <UpdatePasswordForm
                            email={email}
                            hasEmail={Boolean(email)}
                            hasPassword={hasPassword}
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active sessions</CardTitle>
                </CardHeader>
                <CardContent>
                    <SessionsList />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-destructive">
                        Danger zone
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-destructive">
                                Delete account
                            </p>
                            <p className="mt-0.5 text-xs text-white/50">
                                Permanently remove your account and all data.
                            </p>
                        </div>
                        <DeleteAccountDialog />
                    </div>
                </CardContent>
            </Card>
        </>
    );

    let content: ReactNode = accountTab;
    if (activeTab === 'users' && isAdmin)
        content = <AccountManagement callerRole={role} />;
    else if (activeTab === 'sensor-hub' && isAdmin) content = <SensorHubTab />;
    else if (activeTab === 'trading')
        content = <TradingPlanTab plans={plans} />;
    else if (activeTab === 'lifting') {
        const liftingSettings = await api.lifting.settings.get();
        content = <LiftingHub initialSettings={liftingSettings} />;
    }

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-profile',
                    'container mx-auto px-4 py-10 lg:py-16',
                )}
            >
                <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-start md:gap-6">
                    <Card className="p-0 md:sticky md:top-24">
                        <aside className="py-4 md:py-6">
                            <ProfileNav
                                activeTab={activeTab}
                                email={email}
                                isAdmin={isAdmin}
                                isRoot={isUserIsRoot}
                                name={name}
                            />
                        </aside>
                    </Card>

                    <Card className="min-w-0 p-0">
                        <section className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                {TAB_TITLES[activeTab]}
                            </h1>
                            <div className="flex min-w-0 flex-col gap-6">
                                {content}
                            </div>
                        </section>
                    </Card>
                </div>
            </main>
        </HydrateClient>
    );
}
