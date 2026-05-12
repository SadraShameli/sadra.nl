import { createHash, randomBytes } from 'crypto';
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
import { sendPasswordResetEmail } from '~/lib/email';
import { db, passwordResetTokens, users } from '~/server/db';

async function requestReset(formData: FormData) {
    'use server';

    const email = (formData.get('email') as string).trim().toLowerCase();

    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (user) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, user.id));

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(passwordResetTokens).values({
            userId: user.id,
            tokenHash,
            expiresAt,
        });

        await sendPasswordResetEmail(user.email, rawToken);
    }

    redirect('/forgot-password?sent=1');
}

export default async function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ sent?: string }>;
}) {
    const { sent } = await searchParams;

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
                        <CardTitle>Forgot password</CardTitle>
                    </CardHeader>
                    <form action={requestReset}>
                        <CardContent className="flex flex-col gap-3">
                            {sent ? (
                                <Alert variant="success">
                                    <AlertDescription>
                                        If an account exists for that email, a
                                        reset link has been sent.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Enter your email and we&apos;ll send you a
                                    reset link.
                                </p>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="email"
                                    className="text-sm font-medium"
                                >
                                    Email
                                </label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="mt-10 flex flex-col gap-3">
                            <Button type="submit" className="w-full">
                                Send reset link
                            </Button>
                            <p className="text-center text-sm text-muted-foreground">
                                <Link
                                    href="/login"
                                    className="text-foreground underline underline-offset-4 hover:opacity-70"
                                >
                                    Back to sign in
                                </Link>
                            </p>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
