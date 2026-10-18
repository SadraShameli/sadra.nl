import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { CardContent } from '~/components/ui/card';
import { resetPasswordSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

import { ResetPasswordForm } from './ResetPasswordForm';

const errorMessages: Record<string, string> = {
    expired:
        'This reset link has expired or already been used. Request a new one.',
};

type ResetPasswordPageProperties = Pick<
    PageProps<'/reset-password'>,
    'searchParams'
>;

export default function ResetPasswordPage({
    searchParams,
}: ResetPasswordPageProperties) {
    return (
        <AuthPageFrame title="Set new password">
            <Suspense
                fallback={
                    <CardContent>
                        <ResetPasswordForm token="" />
                    </CardContent>
                }
            >
                <ResetPasswordBody searchParams={searchParams} />
            </Suspense>
        </AuthPageFrame>
    );
}

async function ResetPasswordBody({
    searchParams,
}: ResetPasswordPageProperties) {
    const { error, token } = resetPasswordSearchSchema.parse(
        await searchParams,
    );

    if (!token && !error) redirect(routes.auth.forgotPassword);

    return error === 'expired' ? (
        <CardContent className="flex flex-col gap-4">
            <Alert variant="destructive">
                <AlertDescription>{errorMessages.expired}</AlertDescription>
            </Alert>
            <Link
                className="text-sm underline underline-offset-4 hover:opacity-70"
                href={routes.auth.forgotPassword}
            >
                Request a new link
            </Link>
        </CardContent>
    ) : (
        <CardContent>
            <ResetPasswordForm token={token ?? ''} />
        </CardContent>
    );
}
