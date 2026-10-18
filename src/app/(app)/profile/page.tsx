import { and, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';

import { FlashToast } from '~/components/FlashToast';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { PanelSubheading } from '~/components/PanelSubheading';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Card } from '~/components/ui/card';
import { requireSessionUser } from '~/lib/auth/guards';
import { isAdminOrAbove, isRoot, resolveRole } from '~/lib/auth/roles';
import { profileSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { loadTradingPlans } from '~/lib/trading/loadTradingPlans';
import { cn } from '~/lib/utilities';
import { account, db } from '~/server/db';
import { api, HydrateClient } from '~/trpc/server';

import { AccountDetailsForm } from './_components/AccountDetailsForm';
import { AccountManagement } from './_components/AccountManagement';
import { DeleteAccountDialog } from './_components/DeleteAccountDialog';
import { HeroShowcaseForm } from './_components/HeroShowcaseForm';
import { LiftingHub } from './_components/lifting/LiftingHub';
import { ProfileNav } from './_components/ProfileNav';
import { ProfileSkeleton } from './_components/ProfileSkeleton';
import {
    normalizeProfileTab,
    type ProfileTabValue,
} from './_components/profileTabs';
import { SensorHubTab } from './_components/SensorHubTab';
import { SessionsList } from './_components/SessionsList';
import { TradingPlanTab } from './_components/TradingPlanTab';

export const metadata: Metadata = {
    description: 'Manage your account, sessions and trading plan.',
    robots: { follow: false, index: false },
    title: 'Profile · sadra.nl',
};

const TAB_TITLES: Record<ProfileTabValue, string> = {
    account: 'Account',
    contents: 'Contents',
    lifting: 'Lifting',
    'sensor-hub': 'Sensor Hub',
    trading: 'Trading',
    users: 'Users',
};

const SUCCESS_MESSAGES: Record<string, string> = {
    email: 'Email updated successfully.',
    name: 'Name updated successfully.',
    password: 'Password changed successfully.',
};

const PW_MESSAGES: Record<string, string> = {
    email_taken: 'That email is already in use by another account.',
    pw_fail: 'Could not update password.',
    pw_wrong: 'Current password is incorrect.',
};

export default function ProfilePage({ searchParams }: PageProps<'/profile'>) {
    return (
        <main
            className={cn(
                'app-profile',
                'container mx-auto px-4 py-10 lg:py-16',
            )}
        >
            <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-start md:gap-6">
                <Suspense fallback={<ProfileSkeleton />}>
                    <ProfileContent searchParams={searchParams} />
                </Suspense>
            </div>
        </main>
    );
}

async function hasPasswordCredential(userId: string): Promise<boolean> {
    const credentialFilter = and(
        eq(account.userId, userId),
        eq(account.providerId, 'credential'),
    );
    const [credential] = await db
        .select({ password: account.password })
        .from(account)
        .where(credentialFilter)
        .limit(1);
    return Boolean(credential?.password);
}

async function ProfileContent({
    searchParams,
}: Pick<PageProps<'/profile'>, 'searchParams'>) {
    const user = await requireSessionUser(routes.auth.login);

    const isAdmin = isAdminOrAbove(resolveRole(user.email, user.role));
    const [rawParameters, hasPassword, plans] = await Promise.all([
        searchParams,
        hasPasswordCredential(user.id),
        loadTradingPlans(user.id),
        ...(isAdmin
            ? [
                  api.device.listAdmin.prefetch(),
                  api.location.listAdmin.prefetch(),
                  api.sensor.listAdmin.prefetch(),
                  api.user.notification.getMyPrefs.prefetch(),
              ]
            : []),
    ]);
    const { error, success } = profileSearchSchema.parse(rawParameters);

    const { email, name } = user;
    const role = resolveRole(email, user.role);
    const isUserIsRoot = isRoot(role);
    const activeTab = normalizeProfileTab(
        rawParameters.tab,
        isAdmin,
        isUserIsRoot,
    );

    const accountTab: ReactNode = (
        <>
            <ToolPanel contentClassName="gap-4" title="Profile">
                {error && PW_MESSAGES[error] && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {PW_MESSAGES[error]}
                        </AlertDescription>
                    </Alert>
                )}
                {success !== undefined && SUCCESS_MESSAGES[success] && (
                    <FlashToast message={SUCCESS_MESSAGES[success]} />
                )}
                <AccountDetailsForm
                    currentName={name}
                    email={email}
                    hasPassword={hasPassword}
                />
            </ToolPanel>

            <ToolPanel title="Active sessions">
                <SessionsList />
            </ToolPanel>

            <ToolPanel
                title={<span className="text-destructive">Danger zone</span>}
            >
                <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <PanelSubheading className="text-destructive">
                            Delete account
                        </PanelSubheading>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Permanently remove your account and all data.
                        </p>
                    </div>
                    <DeleteAccountDialog />
                </div>
            </ToolPanel>
        </>
    );

    let content: ReactNode = accountTab;
    switch (activeTab) {
        case 'account': {
            break;
        }
        case 'contents': {
            if (isUserIsRoot) {
                const heroShowcase = await api.site.heroShowcase();
                content = (
                    <ToolPanel title="Homepage figures">
                        <HeroShowcaseForm initial={heroShowcase} />
                    </ToolPanel>
                );
            }
            break;
        }
        case 'lifting': {
            const liftingSettings = await api.lifting.settings.get();
            content = <LiftingHub initialSettings={liftingSettings} />;
            break;
        }
        case 'sensor-hub': {
            if (isAdmin) content = <SensorHubTab />;
            break;
        }
        case 'trading': {
            content = <TradingPlanTab plans={plans} />;
            break;
        }
        case 'users': {
            if (isAdmin) content = <AccountManagement callerRole={role} />;
            break;
        }
    }

    return (
        <HydrateClient>
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
                <PageTransition transitionKey={activeTab}>
                    <section className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
                        <PageHeader
                            className="mb-0"
                            title={TAB_TITLES[activeTab]}
                        />
                        <div className="flex min-w-0 flex-col gap-6">
                            {content}
                        </div>
                    </section>
                </PageTransition>
            </Card>
        </HydrateClient>
    );
}
