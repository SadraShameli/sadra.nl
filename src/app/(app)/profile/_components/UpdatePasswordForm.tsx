'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
    type UpdatePasswordInput,
    updatePasswordInputSchema,
} from '~/lib/schemas/auth';
import { routes } from '~/lib/site/routes';

export function UpdatePasswordForm({
    email,
    hasEmail,
    hasPassword,
}: {
    email: null | string;
    hasEmail: boolean;
    hasPassword: boolean;
}) {
    const [pending, startTransition] = useTransition();

    const changeForm = useForm<UpdatePasswordInput>({
        defaultValues: { confirm: '', current: '', password: '' },
        mode: 'onTouched',
        resolver: zodResolver(updatePasswordInputSchema),
    });

    const onChangeSubmit = (data: UpdatePasswordInput) => {
        startTransition(async () => {
            const result = await authClient.changePassword({
                currentPassword: data.current,
                newPassword: data.password,
                revokeOtherSessions: true,
            });
            if (result.error) {
                toast.error(
                    result.error.message ?? 'Current password is incorrect.',
                );
                return;
            }
            toast.success('Password changed.');
            changeForm.reset({ confirm: '', current: '', password: '' });
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

    if (!hasPassword && !hasEmail) {
        return (
            <p className="text-sm text-muted-foreground">
                Set an email address above before adding a password — passwords
                require an email to sign in with.
            </p>
        );
    }

    if (!hasPassword) {
        return (
            <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                    You don&apos;t have a password yet. Send yourself a secure
                    link to set one — it&apos;ll arrive at {email}.
                </p>
                <Button
                    className="self-start"
                    disabled={pending}
                    onClick={sendSetPasswordEmail}
                    type="button"
                >
                    {pending ? 'Sending…' : 'Email me a set-password link'}
                </Button>
            </div>
        );
    }

    return (
        <Form {...changeForm}>
            <form
                className={`app-profile__password-form flex flex-col gap-3`}
                method="post"
                onSubmit={changeForm.handleSubmit(onChangeSubmit)}
            >
                <FormField
                    control={changeForm.control}
                    name="current"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Current password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="current-password"
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
                    control={changeForm.control}
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
                    control={changeForm.control}
                    name="confirm"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm new password</FormLabel>
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
                    className="mt-2 self-start"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Changing…' : 'Change password'}
                </Button>
            </form>
        </Form>
    );
}
