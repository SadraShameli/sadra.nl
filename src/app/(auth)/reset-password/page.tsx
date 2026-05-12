import { createHash } from 'crypto';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { db, passwordResetTokens, users } from '~/server/db';

async function resetPassword(formData: FormData) {
    'use server';

    const token = formData.get('token') as string;
    const password = formData.get('password') as string;
    const confirm = formData.get('confirm') as string;

    if (password.length < 8) redirect(`/reset-password?token=${token}&error=short`);
    if (password !== confirm) redirect(`/reset-password?token=${token}&error=mismatch`);

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const [row] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);

    if (!row || row.expiresAt < new Date()) {
        redirect('/reset-password?error=expired');
    }

    await db
        .update(users)
        .set({ password: await hash(password, 12) })
        .where(eq(users.id, row.userId));

    await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, row.id));

    redirect('/login?success=reset');
}

const errorMessages: Record<string, string> = {
    expired: 'This reset link has expired or already been used. Request a new one.',
    short: 'Password must be at least 8 characters.',
    mismatch: 'Passwords do not match.',
};

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string; error?: string }>;
}) {
    const { token, error } = await searchParams;

    if (!token && !error) redirect('/forgot-password');

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <Link
                    href="/"
                    className="mb-8 block text-center font-orbitron text-lg font-semibold tracking-widest text-white"
                >
                    sadra.nl
                </Link>
                <Card>
                    <CardHeader>
                        <CardTitle>Set new password</CardTitle>
                    </CardHeader>
                    {error === 'expired' ? (
                        <CardContent className="flex flex-col gap-4">
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {errorMessages.expired}
                                </AlertDescription>
                            </Alert>
                            <Link
                                href="/forgot-password"
                                className="text-sm underline underline-offset-4 hover:opacity-70"
                            >
                                Request a new link
                            </Link>
                        </CardContent>
                    ) : (
                        <form action={resetPassword}>
                            <input type="hidden" name="token" value={token} />
                            <CardContent className="flex flex-col gap-3">
                                {error && errorMessages[error] && (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            {errorMessages[error]}
                                        </AlertDescription>
                                    </Alert>
                                )}
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
                                        Confirm password
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
                            </CardContent>
                            <CardFooter className="flex flex-col gap-3">
                                <Button type="submit" className="w-full">
                                    Reset password
                                </Button>
                            </CardFooter>
                        </form>
                    )}
                </Card>
            </div>
        </div>
    );
}
