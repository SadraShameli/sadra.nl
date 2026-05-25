'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '~/components/ui/Alert';
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
    type ResetPasswordInput,
    resetPasswordInputSchema,
} from '~/lib/schemas/auth';
import { routes, withQuery } from '~/lib/site/routes';

export function ResetPasswordForm({ token }: { token: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [topError, setTopError] = useState<null | string>(null);
    const form = useForm<ResetPasswordInput>({
        defaultValues: { confirm: '', password: '', token },
        mode: 'onTouched',
        resolver: zodResolver(resetPasswordInputSchema),
    });

    const onSubmit = (data: ResetPasswordInput) => {
        setTopError(null);
        startTransition(async () => {
            const result = await authClient.resetPassword({
                newPassword: data.password,
                token: data.token,
            });
            if (result.error) {
                setTopError(
                    result.error.message ?? 'Token expired or invalid.',
                );
                return;
            }
            router.push(withQuery(routes.auth.login, { success: 'reset' }));
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__reset-form flex flex-col gap-3`}
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
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    type="password"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    type="password"
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
                    {pending ? 'Resetting…' : 'Reset password'}
                </Button>
            </form>
        </Form>
    );
}
