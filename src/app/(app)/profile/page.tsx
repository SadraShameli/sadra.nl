import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Separator } from '~/components/ui/Separator';
import { auth } from '~/lib/auth';
import { profileSearchSchema } from '~/lib/schemas/url';
import { ensureUserHasPlan } from '~/lib/trading-actions';
import { db, tradingPlans, users } from '~/server/db';
import { DeleteAccountDialog } from './_components/DeleteAccountDialog';
import { LogoutButton } from './_components/LogoutButton';
import { ProfileTabs } from './_components/ProfileTabs';
import { SessionsList } from './_components/SessionsList';
import { TradingPlanTab } from './_components/TradingPlanTab';
import { UpdateNameForm } from './_components/UpdateNameForm';
import { UpdatePasswordForm } from './_components/UpdatePasswordForm';

const pwMessages: Record<string, string> = {
    pw_wrong: 'Current password is incorrect.',
    pw_fail: 'Could not update password.',
};

function Avatar({
    name,
    email,
}: {
    name?: string | null;
    email?: string | null;
}) {
    const letter = (name ?? email ?? '?')[0]!.toUpperCase();
    return (
        <div className="flex size-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <span className="font-orbitron text-3xl font-bold text-white">
                {letter}
            </span>
        </div>
    );
}

export default async function ProfilePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const { error, success } = profileSearchSchema.parse(await searchParams);

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
    if (!user) redirect('/login');

    await ensureUserHasPlan();

    const plans = await db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, session.user.id))
        .orderBy(tradingPlans.sortOrder, desc(tradingPlans.updatedAt));

    const { name, email } = user;

    const accountTab = (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {success === 'name' && (
                        <Alert variant="success">
                            <AlertDescription>
                                Name updated successfully.
                            </AlertDescription>
                        </Alert>
                    )}
                    <UpdateNameForm
                        currentName={name ?? ''}
                        email={email ?? ''}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                    <UpdatePasswordForm />
                </CardContent>
            </Card>

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
        <main className="container mx-auto py-16">
            <div className="mx-auto max-w-3xl space-y-8">
                <div className="flex items-center gap-5">
                    <Avatar name={name} email={email} />
                    <div>
                        <h1 className="text-2xl font-semibold text-white">
                            {name ?? 'No name set'}
                        </h1>
                        <p className="mt-0.5 text-sm text-white/50">{email}</p>
                    </div>
                </div>

                <ProfileTabs
                    accountTab={accountTab}
                    securityTab={securityTab}
                    tradingPlanTab={tradingPlanTab}
                />
            </div>
        </main>
    );
}
