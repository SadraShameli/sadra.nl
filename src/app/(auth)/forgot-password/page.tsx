import Link from 'next/link';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CardContent, CardFooter } from '~/components/ui/card';
import { forgotPasswordSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

import { ForgotPasswordForm } from './ForgotPasswordForm';

type ForgotPasswordPageProperties = Pick<
    PageProps<'/forgot-password'>,
    'searchParams'
>;

export default function ForgotPasswordPage({
    searchParams,
}: ForgotPasswordPageProperties) {
    return (
        <AuthPageFrame title="Forgot password">
            <CardContent className="flex flex-col gap-3">
                <Suspense fallback={<ForgotPasswordIntro />}>
                    <ForgotPasswordNotice searchParams={searchParams} />
                </Suspense>
                <ForgotPasswordForm />
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

function ForgotPasswordIntro() {
    return (
        <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
        </p>
    );
}

async function ForgotPasswordNotice({
    searchParams,
}: ForgotPasswordPageProperties) {
    const { sent } = forgotPasswordSearchSchema.parse(await searchParams);
    return sent ? (
        <StatusRow
            title="If an account exists for that email, a reset link has been sent."
            tone={StatusTone.Pass}
        />
    ) : (
        <ForgotPasswordIntro />
    );
}
