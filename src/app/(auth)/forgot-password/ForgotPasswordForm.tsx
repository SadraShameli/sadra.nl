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
import { requestPasswordReset } from '~/lib/auth-actions';
import {
    forgotPasswordInputSchema,
    type ForgotPasswordInput,
} from '~/lib/schemas/auth';

export function ForgotPasswordForm() {
    const [pending, startTransition] = useTransition();
    const form = useForm<ForgotPasswordInput>({
        resolver: zodResolver(forgotPasswordInputSchema),
        defaultValues: { email: '' },
        mode: 'onTouched',
    });

    const onSubmit = (data: ForgotPasswordInput) => {
        startTransition(async () => {
            await requestPasswordReset(data);
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
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    autoComplete="email"
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
                    {pending ? 'Sending…' : 'Send reset link'}
                </Button>
            </form>
        </Form>
    );
}
