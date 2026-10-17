'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { authClient } from '~/lib/auth/client';
import { EmailLink } from '~/lib/auth/EmailLink';
import { type MagicLinkInput, magicLinkInputSchema } from '~/lib/schemas/auth';
import { currentCallbackUrl } from '~/lib/site/privateRoutes';
import { routes, withQuery } from '~/lib/site/routes';

export function MagicLinkForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [topError, setTopError] = useState<null | string>(null);

    const form = useForm<MagicLinkInput>({
        defaultValues: { email: '' },
        mode: 'onTouched',
        resolver: zodResolver(magicLinkInputSchema),
    });

    const onSubmit = (data: MagicLinkInput) => {
        setTopError(null);
        const callbackUrl = currentCallbackUrl();
        startTransition(async () => {
            const result = await authClient.signIn.magicLink({
                callbackURL: callbackUrl,
                email: data.email,
            });
            if (result.error) {
                setTopError(result.error.message ?? 'Could not send link.');
                return;
            }
            router.push(
                withQuery(routes.auth.verifyRequest, {
                    link: EmailLink.SignIn,
                }),
            );
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__magic-link-form flex flex-col gap-3`}
                method="post"
                onSubmit={form.handleSubmit(onSubmit)}
            >
                {topError && (
                    <Alert variant="destructive">
                        <AlertDescription>{topError}</AlertDescription>
                    </Alert>
                )}
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    type="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    className="mt-5 w-full"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Sending link…' : 'Email me a sign-in link'}
                </Button>
            </form>
        </Form>
    );
}
