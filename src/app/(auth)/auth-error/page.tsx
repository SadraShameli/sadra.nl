import Link from 'next/link';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { CardContent, CardFooter } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { authErrorSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

const errorMessages: Record<string, string> = {
    AccessDenied: 'Access denied.',
    Configuration: 'Authentication is misconfigured. Please contact support.',
    CredentialsSignin: 'Invalid email or password.',
    email_send: 'Could not send the sign-in email. Please try again.',
    EmailSignInError: 'Could not send the sign-in email.',
    OAuthAccountNotLinked:
        'This email is already used with a different sign-in method.',
    OAuthCallbackError: 'Sign-in failed during the provider callback.',
    OAuthSignInError: 'Could not start the sign-in flow with that provider.',
    rate_limited: 'Too many requests. Please wait a few minutes and retry.',
    SessionRequired: 'Please sign in to continue.',
    sign_in: 'We could not sign you in. Please try again.',
    Verification:
        'This sign-in link has expired or already been used. Request a new one.',
};

const FALLBACK_MESSAGE = 'Something went wrong. Try again.';

type AuthErrorPageProperties = Pick<PageProps<'/auth-error'>, 'searchParams'>;

export default function AuthErrorPage({
    searchParams,
}: AuthErrorPageProperties) {
    return (
        <AuthPageFrame title="Sign-in problem">
            <CardContent>
                <Alert variant="destructive">
                    <AlertDescription>
                        <Suspense
                            fallback={<Skeleton className="h-5 w-full" />}
                        >
                            <AuthErrorMessage searchParams={searchParams} />
                        </Suspense>
                    </AlertDescription>
                </Alert>
            </CardContent>
            <CardFooter className="mt-2 flex flex-col gap-3">
                <p className="text-center text-sm text-muted-foreground">
                    <Link
                        className="text-foreground underline underline-offset-4 hover:opacity-70"
                        href={routes.auth.login}
                    >
                        Back to sign in
                    </Link>
                </p>
            </CardFooter>
        </AuthPageFrame>
    );
}

async function AuthErrorMessage({ searchParams }: AuthErrorPageProperties) {
    const { error } = authErrorSearchSchema.parse(await searchParams);
    return (error && errorMessages[error]) ?? FALLBACK_MESSAGE;
}
