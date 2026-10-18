import Link from 'next/link';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CardContent, CardFooter } from '~/components/ui/card';
import { emailLinkSentText } from '~/lib/auth/EmailLink';
import { verifyRequestSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

export default function VerifyRequestPage({
    searchParams,
}: Pick<PageProps<'/verify-request'>, 'searchParams'>) {
    return (
        <AuthPageFrame title="Check your email">
            <CardContent>
                <StatusRow
                    title={
                        <Suspense
                            fallback={
                                "We've sent you a link. Click it to continue."
                            }
                        >
                            <VerifyRequestNotice searchParams={searchParams} />
                        </Suspense>
                    }
                    tone={StatusTone.Pass}
                />
            </CardContent>
            <CardFooter>
                <p className="text-center text-sm text-muted-foreground">
                    Didn&apos;t get the email? Check spam, then{' '}
                    <Link
                        className="text-foreground underline underline-offset-4 hover:opacity-70"
                        href={routes.auth.login}
                    >
                        try again
                    </Link>
                    .
                </p>
            </CardFooter>
        </AuthPageFrame>
    );
}

async function VerifyRequestNotice({
    searchParams,
}: Pick<PageProps<'/verify-request'>, 'searchParams'>) {
    const { link } = verifyRequestSearchSchema.parse(await searchParams);
    return emailLinkSentText(link);
}
