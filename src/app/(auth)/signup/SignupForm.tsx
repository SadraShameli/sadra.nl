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
import { EmailLink } from '~/lib/auth/EmailLink';
import { type SignupInput, signupInputSchema } from '~/lib/schemas/auth';
import { currentCallbackUrl } from '~/lib/site/privateRoutes';
import { routes, withQuery } from '~/lib/site/routes';

export function SignupForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [topError, setTopError] = useState<null | string>(null);

    const form = useForm<SignupInput>({
        defaultValues: {
            confirm: '',
            email: '',
            name: '',
            password: '',
        },
        mode: 'onTouched',
        resolver: zodResolver(signupInputSchema),
    });
    const formId = useId();

    const onSubmit = (data: SignupInput) => {
        setTopError(null);
        const callbackUrl = currentCallbackUrl();
        startTransition(async () => {
            const result = await authClient.signUp.email({
                callbackURL: callbackUrl,
                email: data.email,
                name: data.name,
                password: data.password,
            });
            if (result.error) {
                setTopError(
                    result.error.message ?? 'Could not create account.',
                );
                return;
            }
            router.push(
                withQuery(routes.auth.verifyRequest, {
                    link: EmailLink.Verification,
                }),
            );
        });
    };

    return (
        <form
            className={`app-auth__signup-form flex flex-col gap-3`}
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
                name="name"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="name"
                            id={`${formId}-name`}
                            placeholder="Your name"
                            type="text"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
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
                {pending ? 'Creating account…' : 'Create account'}
            </Button>
        </form>
    );
}
