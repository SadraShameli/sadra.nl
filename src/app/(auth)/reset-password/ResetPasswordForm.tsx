'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
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
    const formId = useId();

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
            <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-password`}>
                            New password
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="new-password"
                            id={`${formId}-password`}
                            placeholder="••••••••"
                            type="password"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="confirm"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-confirm`}>
                            Confirm password
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="new-password"
                            id={`${formId}-confirm`}
                            placeholder="••••••••"
                            type="password"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Button className="mt-7 w-full" disabled={pending} type="submit">
                {pending ? 'Resetting…' : 'Reset password'}
            </Button>
        </form>
    );
}
