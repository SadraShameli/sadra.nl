'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormFooter } from '~/app/(app)/profile/_components/ProfileFormFooter';
import { Button } from '~/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { authClient } from '~/lib/auth/client';
import {
    type UpdateAccountInput,
    updateAccountInputSchema,
} from '~/lib/schemas/auth';
import { routes } from '~/lib/site/routes';

const EMPTY_PASSWORDS = { confirm: '', current: '', password: '' } as const;

export function AccountDetailsForm({
    currentName,
    email,
    hasPassword,
}: {
    readonly currentName: string;
    readonly email: null | string;
    readonly hasPassword: boolean;
}) {
    const router = useRouter();
    const formId = useId();
    const [pending, startTransition] = useTransition();
    const form = useForm<UpdateAccountInput>({
        defaultValues: {
            ...EMPTY_PASSWORDS,
            email: email ?? '',
            name: currentName,
        },
        mode: 'onTouched',
        resolver: zodResolver(updateAccountInputSchema),
    });

    const save = (data: UpdateAccountInput) => {
        const isNameChanged = data.name !== currentName.trim();
        const isEmailChanged = data.email !== (email ?? '');
        const isPasswordChanged = data.password !== '';
        if (!isNameChanged && !isEmailChanged && !isPasswordChanged) {
            toast.info('No changes to save.');
            return;
        }
        startTransition(async () => {
            if (isNameChanged) {
                const result = await authClient.updateUser({ name: data.name });
                if (result.error) {
                    toast.error(result.error.message ?? 'Could not save name.');
                    return;
                }
            }
            if (isEmailChanged) {
                const result = await authClient.changeEmail({
                    callbackURL: routes.profile,
                    newEmail: data.email,
                });
                if (result.error) {
                    toast.error(
                        result.error.message ?? 'Could not update email.',
                    );
                    return;
                }
                toast.info(
                    'Approval link sent to your current address. Approve it there, then verify the new one.',
                );
            }
            if (isPasswordChanged) {
                const result = await authClient.changePassword({
                    currentPassword: data.current,
                    newPassword: data.password,
                    revokeOtherSessions: true,
                });
                if (result.error) {
                    toast.error(
                        result.error.message ??
                            'Current password is incorrect.',
                    );
                    return;
                }
            }
            toast.success('Profile saved.');
            form.reset({ ...data, ...EMPTY_PASSWORDS });
            router.refresh();
        });
    };

    const sendSetPasswordEmail = () => {
        if (!email) return;
        startTransition(async () => {
            const result = await authClient.requestPasswordReset({
                email,
                redirectTo: routes.auth.resetPassword,
            });
            if (result.error) {
                toast.error(
                    result.error.message ?? 'Could not send the email.',
                );
                return;
            }
            toast.success('Check your inbox for the password set-up link.');
        });
    };

    return (
        <form
            className="app-profile__account-form flex flex-col gap-8"
            method="post"
            onSubmit={form.handleSubmit(save)}
        >
            <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Controller
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-name`}>
                                Display name
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="name"
                                id={`${formId}-name`}
                                placeholder="Your name"
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
                                placeholder="your@email.com"
                                type="email"
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            </FieldGroup>

            <FieldSet>
                <FieldLegend variant="label">Password</FieldLegend>
                {hasPassword ? (
                    <FieldGroup className="grid gap-5 md:grid-cols-3">
                        <PasswordField
                            control={form.control}
                            formId={formId}
                            label="Current password"
                            name="current"
                        />
                        <PasswordField
                            control={form.control}
                            formId={formId}
                            label="New password"
                            name="password"
                        />
                        <PasswordField
                            control={form.control}
                            formId={formId}
                            label="Confirm new password"
                            name="confirm"
                        />
                    </FieldGroup>
                ) : (
                    <FieldDescription>
                        {email ? (
                            <>
                                You don&apos;t have a password yet.{' '}
                                <Button
                                    className="h-auto p-0 align-baseline"
                                    disabled={pending}
                                    onClick={sendSetPasswordEmail}
                                    type="button"
                                    variant="link"
                                >
                                    Email me a set-password link
                                </Button>
                            </>
                        ) : (
                            'Add an email address before setting a password.'
                        )}
                    </FieldDescription>
                )}
            </FieldSet>

            <ProfileFormFooter
                isDirty={form.formState.isDirty}
                isPending={pending}
                onCancel={() => form.reset()}
            />
        </form>
    );
}

function PasswordField({
    control,
    formId,
    label,
    name,
}: {
    readonly control: ReturnType<typeof useForm<UpdateAccountInput>>['control'];
    readonly formId: string;
    readonly label: string;
    readonly name: 'confirm' | 'current' | 'password';
}) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${name}`}>
                        {label}
                    </FieldLabel>
                    <Input
                        aria-invalid={fieldState.invalid}
                        autoComplete={
                            name === 'current'
                                ? 'current-password'
                                : 'new-password'
                        }
                        id={`${formId}-${name}`}
                        placeholder="••••••••"
                        type="password"
                        {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}
