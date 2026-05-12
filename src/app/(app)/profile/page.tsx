import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { Separator } from '~/components/ui/Separator';
import { auth } from '~/lib/auth';
import { logout, updateName, updatePassword } from '~/lib/auth-actions';
import { db, users } from '~/server/db';
import { DeleteAccountDialog } from './_components/DeleteAccountDialog';

const nameMessages: Record<string, string> = {
    name_required: 'Name cannot be empty.',
    name_unchanged: 'No changes to save.',
};

const pwMessages: Record<string, string> = {
    pw_wrong: 'Current password is incorrect.',
    pw_mismatch: 'New passwords do not match.',
    pw_short: 'Password must be at least 8 characters.',
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
    searchParams: Promise<{ error?: string; success?: string }>;
}) {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const { error, success } = await searchParams;

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
    if (!user) redirect('/login');

    const { name, email } = user;

    return (
        <main className="container mx-auto py-16">
            <div className="mx-auto max-w-2xl space-y-8">
                <div className="flex items-center gap-5">
                    <Avatar name={name} email={email} />
                    <div>
                        <h1 className="text-2xl font-semibold text-white">
                            {name ?? 'No name set'}
                        </h1>
                        <p className="mt-0.5 text-sm text-white/50">{email}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && nameMessages[error] && (
                            <Alert
                                variant={
                                    error === 'name_unchanged'
                                        ? 'warning'
                                        : 'destructive'
                                }
                            >
                                <AlertDescription>
                                    {nameMessages[error]}
                                </AlertDescription>
                            </Alert>
                        )}
                        {success === 'name' && (
                            <Alert variant="success">
                                <AlertDescription>
                                    Name updated successfully.
                                </AlertDescription>
                            </Alert>
                        )}
                        <form
                            action={updateName}
                            className="flex flex-col gap-3"
                        >
                            <input
                                type="hidden"
                                name="currentName"
                                value={name ?? ''}
                            />
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="name"
                                    className="text-sm font-medium"
                                >
                                    Display name
                                </label>
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    defaultValue={name ?? ''}
                                    placeholder="Your name"
                                    required
                                    autoComplete="name"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium">
                                    Email
                                </label>
                                <Input
                                    value={email ?? ''}
                                    disabled
                                    readOnly
                                    className="opacity-50"
                                />
                            </div>
                            <Button type="submit" className="self-start">
                                Save changes
                            </Button>
                        </form>
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
                        <form
                            action={updatePassword}
                            className="flex flex-col gap-3"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="current"
                                    className="text-sm font-medium"
                                >
                                    Current password
                                </label>
                                <Input
                                    id="current"
                                    name="current"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="password"
                                    className="text-sm font-medium"
                                >
                                    New password
                                </label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="confirm"
                                    className="text-sm font-medium"
                                >
                                    Confirm new password
                                </label>
                                <Input
                                    id="confirm"
                                    name="confirm"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                            <Button type="submit" className="self-start">
                                Change password
                            </Button>
                        </form>
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
                            <form action={logout}>
                                <Button type="submit" variant="outline">
                                    Sign out
                                </Button>
                            </form>
                        </div>
                        <Separator className="mt-6" />
                        <div className="mt-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-destructive">
                                    Delete account
                                </p>
                                <p className="mt-0.5 text-xs text-white/50">
                                    Permanently remove your account and all
                                    data.
                                </p>
                            </div>
                            <DeleteAccountDialog />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
