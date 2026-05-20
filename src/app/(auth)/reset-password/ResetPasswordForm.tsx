'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { resetPassword } from '~/lib/auth/actions';
import {
    type ResetPasswordInput,
    resetPasswordInputSchema,
} from '~/lib/schemas/auth';

export function ResetPasswordForm({ token }: { token: string }) {
    const [pending, startTransition] = useTransition();
    const form = useForm<ResetPasswordInput>({
        defaultValues: { confirm: '', password: '', token },
        mode: 'onTouched',
        resolver: zodResolver(resetPasswordInputSchema),
    });

    const onSubmit = (data: ResetPasswordInput) => {
        startTransition(async () => {
            await resetPassword(data);
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__reset-form flex flex-col gap-3`}
                onSubmit={form.handleSubmit(onSubmit)}
            >
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
