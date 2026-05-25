'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '~/components/ui/Button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { authClient } from '~/lib/auth/client';
import {
    type ForgotPasswordInput,
    forgotPasswordInputSchema,
} from '~/lib/schemas/auth';
import { routes, withQuery } from '~/lib/site/routes';

export function ForgotPasswordForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const form = useForm<ForgotPasswordInput>({
        defaultValues: { email: '' },
        mode: 'onTouched',
        resolver: zodResolver(forgotPasswordInputSchema),
    });

    const onSubmit = (data: ForgotPasswordInput) => {
        startTransition(async () => {
            await authClient.requestPasswordReset({
                email: data.email,
                redirectTo: routes.auth.resetPassword,
            });
            router.push(withQuery(routes.auth.forgotPassword, { sent: 1 }));
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__forgot-form flex flex-col gap-3`}
                method="post"
                onSubmit={form.handleSubmit(onSubmit)}
            >
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
                    className="mt-7 w-full"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Sending…' : 'Send reset link'}
                </Button>
            </form>
        </Form>
    );
}
