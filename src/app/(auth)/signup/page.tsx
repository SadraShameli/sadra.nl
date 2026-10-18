import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { OAuthButtons } from '~/app/(auth)/_components/OAuthButtons';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { CardContent, CardFooter } from '~/components/ui/card';
import { environment } from '~/environment';
import { readSession } from '~/lib/auth/session';
import { signupSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

import { SignupForm } from './SignupForm';

const errorMessages: Record<string, string> = {
    taken: 'An account with that email already exists.',
};

type SignupPageProperties = Pick<PageProps<'/signup'>, 'searchParams'>;

export default function SignupPage({ searchParams }: SignupPageProperties) {
    return (
        <AuthPageFrame title="Create account">
            <CardContent className="flex flex-col gap-3">
                <Suspense fallback={null}>
                    <SignupNotices searchParams={searchParams} />
                </Suspense>
                <OAuthButtons
                    hasGithub={Boolean(
                        environment.AUTH_GITHUB_ID &&
                        environment.AUTH_GITHUB_SECRET,
                    )}
                    hasGoogle={Boolean(
                        environment.AUTH_GOOGLE_ID &&
                        environment.AUTH_GOOGLE_SECRET,
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
        </AuthPageFrame>
    );
}

async function SignupNotices({ searchParams }: SignupPageProperties) {
    const session = await readSession();
    if (session?.user.id) redirect(routes.home);

    const { error } = signupSearchSchema.parse(await searchParams);
    if (!error) return null;

    return (
        <Alert variant="destructive">
            <AlertDescription>
                {errorMessages[error] ?? 'Something went wrong.'}
            </AlertDescription>
        </Alert>
    );
}
