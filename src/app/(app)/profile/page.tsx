import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';

export const metadata: Metadata = {
    description: 'Manage your account, sessions and trading plan.',
    robots: { follow: false, index: false },
    title: 'Profile · sadra.nl',
};
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Separator } from '~/components/ui/Separator';
import { auth } from '~/lib/auth';
import { isAdminOrAbove, resolveRole } from '~/lib/auth-roles';
import { routes } from '~/lib/routes';
import { profileSearchSchema } from '~/lib/schemas/url';
import { ensureUserHasPlan } from '~/lib/trading-actions';
import { cn } from '~/lib/utils';
import { db, tradingPlans, users } from '~/server/db';

import { AccountManagement } from './_components/AccountManagement';
import { DeleteAccountDialog } from './_components/DeleteAccountDialog';
import { LogoutButton } from './_components/LogoutButton';
import { ProfileTabs } from './_components/ProfileTabs';
import { SensorHubTab } from './_components/SensorHubTab';
import { SessionsList } from './_components/SessionsList';
import { TradingPlanTab } from './_components/TradingPlanTab';
import { UpdateNameForm } from './_components/UpdateNameForm';
import { UpdatePasswordForm } from './_components/UpdatePasswordForm';

const pwMessages: Record<string, string> = {
    email_taken: 'That email is already in use by another account.',
    pw_fail: 'Could not update password.',
    pw_wrong: 'Current password is incorrect.',
};

export default async function ProfilePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);

    const { error, success } = profileSearchSchema.parse(await searchParams);

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
    if (!user) redirect(routes.auth.login);

    await ensureUserHasPlan();

    const plans = await db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, session.user.id))
        .orderBy(tradingPlans.sortOrder, desc(tradingPlans.updatedAt));

    const { email, name } = user;
    const role = resolveRole(user.email, user.role);
    const isAdmin = isAdminOrAbove(role);

    const accountTab = (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {success === 'name' && (
                        <Alert variant="success">
                            <AlertDescription>
                                Name updated successfully.
                            </AlertDescription>
                        </Alert>
                    )}
                    {success === 'email' && (
                        <Alert variant="success">
                            <AlertDescription>
                                Email updated successfully.
                            </AlertDescription>
                        </Alert>
                    )}
                    <UpdateNameForm currentName={name ?? ''} email={email} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Security</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {error && pwMessages[error] && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {pwMessages[error]}
                            </AlertDescription>
                        </Alert>
                    )}
                    {success === 'password' && (
                        <Alert variant="success">
                            <AlertDescription>
                                Password changed successfully.
                            </AlertDescription>
                        </Alert>
                    )}
                    <UpdatePasswordForm
                        hasEmail={!!user.email}
                        hasPassword={!!user.password}
                    />
                </CardContent>
            </Card>

            {isAdmin && <AccountManagement callerRole={role} />}

            <Card>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium">Sign out</p>
                            <p className="mt-0.5 text-xs text-white/50">
                                You will be signed out of your account.
                            </p>
                        </div>
                        <LogoutButton />
                    </div>
                    <Separator className="mt-6" />
                    <div className="mt-6 flex items-center justify-between">
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

    const sensorHubTab = isAdmin ? <SensorHubTab /> : null;
    const tradingPlanTab = <TradingPlanTab plans={plans} />;

    const securityTab = (
        <Card>
            <CardHeader>
                <CardTitle>Active sessions</CardTitle>
            </CardHeader>
            <CardContent>
                <SessionsList />
            </CardContent>
        </Card>
    );

    return (
        <main className={cn('app-profile', 'container mx-auto py-16')}>
            <div className="mx-auto flex max-w-3xl flex-col gap-8">
                <div className="flex items-center gap-5">
                    <Avatar email={email} name={name} />
                    <div>
                        <h1 className="text-2xl font-semibold text-white">
                            {name ?? 'No name set'}
                        </h1>
                        <p className="mt-0.5 text-sm text-white/50">
                            {email ?? 'No email set'}
                        </p>
                    </div>
                </div>

                <ProfileTabs
                    accountTab={accountTab}
                    securityTab={securityTab}
                    sensorHubTab={sensorHubTab}
                    tradingPlanTab={tradingPlanTab}
                />
            </div>
        </main>
    );
}

function Avatar({
    email,
    name,
}: {
    email?: null | string;
    name?: null | string;
}) {
    const letter = ((name ?? email ?? '?')[0] ?? '?').toUpperCase();
    return (
        <div
            className={cn(
                'app-profile__avatar',
                'flex size-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20',
            )}
        >
            <span className="font-orbitron text-3xl font-bold text-white">
                {letter}
            </span>
        </div>
    );
}
