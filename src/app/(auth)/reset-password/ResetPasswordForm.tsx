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
import { resetPassword } from '~/lib/auth-actions';
import {
    resetPasswordInputSchema,
    type ResetPasswordInput,
} from '~/lib/schemas/auth';

export function ResetPasswordForm({ token }: { token: string }) {
    const [pending, startTransition] = useTransition();
    const form = useForm<ResetPasswordInput>({
        resolver: zodResolver(resetPasswordInputSchema),
        defaultValues: { token, password: '', confirm: '' },
        mode: 'onTouched',
    });

    const onSubmit = (data: ResetPasswordInput) => {
        startTransition(async () => {
            await resetPassword(data);
        });
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-3"
            >
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New password</FormLabel>
                            <FormControl>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
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
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="mt-7 w-full"
                    disabled={pending}
                >
                    {pending ? 'Resetting…' : 'Reset password'}
                </Button>
            </form>
        </Form>
    );
}
