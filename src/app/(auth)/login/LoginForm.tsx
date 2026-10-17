'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { authClient } from '~/lib/auth/client';
import { type LoginInput, loginInputSchema } from '~/lib/schemas/auth';
import { currentCallbackUrl } from '~/lib/site/privateRoutes';

export function LoginForm() {
    const [pending, startTransition] = useTransition();
    const [topError, setTopError] = useState<null | string>(null);

    const form = useForm<LoginInput>({
        defaultValues: { email: '', password: '' },
        mode: 'onTouched',
        resolver: zodResolver(loginInputSchema),
    });
    const formId = useId();

    const onSubmit = (data: LoginInput) => {
        setTopError(null);
        const callbackUrl = currentCallbackUrl();
        startTransition(async () => {
            const result = await authClient.signIn.email({
                callbackURL: callbackUrl,
                email: data.email,
                password: data.password,
            });
            if (result.error) {
                setTopError(
                    result.error.message ?? 'Invalid email or password.',
                );
                return;
            }
            window.location.assign(callbackUrl);
        });
    };

    return (
        <form
            className={`app-auth__login-form flex flex-col gap-3`}
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
            <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-password`}>
                            Password
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="current-password"
                            id={`${formId}-password`}
                            placeholder="••••••••"
                            type="password"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Button className="mt-7 w-full" disabled={pending} type="submit">
                {pending ? 'Signing in…' : 'Sign in'}
            </Button>
        </form>
    );
}
