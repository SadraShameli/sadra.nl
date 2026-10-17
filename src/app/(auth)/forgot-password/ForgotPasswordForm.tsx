'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
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
    const formId = useId();

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
        <form
            className={`app-auth__forgot-form flex flex-col gap-3`}
            method="post"
            onSubmit={form.handleSubmit(onSubmit)}
        >
            <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-email`}>
                            Email
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="email"
                            id={`${formId}-email`}
                            placeholder="you@example.com"
                            type="email"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Button className="mt-7 w-full" disabled={pending} type="submit">
                {pending ? 'Sending…' : 'Send reset link'}
            </Button>
        </form>
    );
}
