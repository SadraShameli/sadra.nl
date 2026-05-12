import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';

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
import { signIn } from '~/lib/auth';
import { db, users } from '~/server/db';

const signupSchema = z.object({
    name: z.string().min(1).max(256),
    email: z.string().email().max(256),
    password: z.string().min(8).max(256),
    confirm: z.string(),
});

async function signup(formData: FormData) {
    'use server';

    const parsed = signupSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirm: formData.get('confirm'),
    });

    if (!parsed.success) {
        redirect('/signup?error=invalid');
    }

    const { name, email, password, confirm } = parsed.data;

    if (password !== confirm) {
        redirect('/signup?error=mismatch');
    }

    const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    if (existing) {
        redirect('/signup?error=taken');
    }

    const hashed = await hash(password, 12);
    await db.insert(users).values({ name, email, password: hashed });

    try {
        await signIn('credentials', { email, password, redirectTo: '/' });
    } catch (error) {
        if (error instanceof AuthError) {
            redirect('/login');
        }
        throw error;
    }
}

const errorMessages: Record<string, string> = {
    invalid: 'Please fill in all fields correctly.',
    mismatch: 'Passwords do not match.',
    taken: 'An account with that email already exists.',
};

export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    const errorMessage = error
        ? (errorMessages[error] ?? 'Something went wrong.')
        : null;

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
                        <CardTitle>Create account</CardTitle>
                    </CardHeader>
                    <form action={signup}>
                        <CardContent className="flex flex-col gap-3">
                            {errorMessage && (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        {errorMessage}
                                    </AlertDescription>
                                </Alert>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="name"
                                    className="text-sm font-medium"
                                >
                                    Name
                                </label>
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    placeholder="Your name"
                                    required
                                    autoComplete="name"
                                />
                            </div>
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
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="password"
                                    className="text-sm font-medium"
                                >
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                    minLength={8}
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
                        <CardFooter className="mt-10 flex flex-col gap-3">
                            <Button type="submit" className="w-full">
                                Create account
                            </Button>
                            <p className="text-center text-sm text-muted-foreground">
                                Already have an account?{' '}
                                <Link
                                    href="/login"
                                    className="text-foreground underline underline-offset-4 hover:opacity-70"
                                >
                                    Sign in
                                </Link>
                            </p>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
