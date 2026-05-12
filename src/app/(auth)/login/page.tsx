import { AuthError } from 'next-auth';
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
import { signIn } from '~/lib/auth';

async function login(formData: FormData) {
    'use server';
    try {
        await signIn('credentials', {
            email: formData.get('email'),
            password: formData.get('password'),
            redirectTo: '/',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            redirect('/login?error=invalid');
        }
        throw error;
    }
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;

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
                        <CardTitle>Sign in</CardTitle>
                    </CardHeader>
                    <form action={login}>
                        <CardContent className="flex flex-col gap-3">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        Invalid email or password.
                                    </AlertDescription>
                                </Alert>
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
                                    autoComplete="current-password"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="mt-10 flex flex-col gap-3">
                            <Button type="submit" className="w-full">
                                Sign in
                            </Button>
                            <p className="text-center text-sm text-muted-foreground">
                                No account?{' '}
                                <Link
                                    href="/signup"
                                    className="text-foreground underline underline-offset-4 hover:opacity-70"
                                >
                                    Sign up
                                </Link>
                            </p>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
