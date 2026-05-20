import Link from 'next/link';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { env } from '~/env';
import { routes } from '~/lib/routes';
import { signupSearchSchema } from '~/lib/schemas/url';
import { cn } from '~/lib/utils';

import { OAuthButtons } from '../_components/OAuthButtons';
import { SignupForm } from './SignupForm';

const errorMessages: Record<string, string> = {
    taken: 'An account with that email already exists.',
};

export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { error } = signupSearchSchema.parse(await searchParams);
    const errorMessage = error
        ? (errorMessages[error] ?? 'Something went wrong.')
        : null;

    return (
        <div
            className={cn(
                'app-auth__page',
                'flex min-h-screen items-center justify-center px-4',
            )}
        >
            <div className="w-full max-w-sm">
                <Link
                    className={cn(
                        'app-auth__logo',
                        'mb-8 block text-center font-orbitron text-lg font-semibold tracking-widest text-white',
                    )}
                    href={routes.home}
                >
                    sadra.nl
                </Link>
                <Card>
                    <CardHeader>
                        <CardTitle>Create account</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {errorMessage && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {errorMessage}
                                </AlertDescription>
                            </Alert>
                        )}
                        <OAuthButtons
                            hasGithub={Boolean(
                                env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET,
                            )}
                            hasGoogle={Boolean(
                                env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
                            )}
                        />
                        <SignupForm />
                    </CardContent>
                    <CardFooter className="mt-2 flex flex-col gap-3">
                        <p className="text-center text-sm text-muted-foreground">
                            Already have an account?{' '}
                            <Link
                                className="text-foreground underline underline-offset-4 hover:opacity-70"
                                href={routes.auth.login}
                            >
                                Sign in
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
