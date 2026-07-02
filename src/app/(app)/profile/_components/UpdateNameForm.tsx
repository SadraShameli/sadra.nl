'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { Label } from '~/components/ui/Label';
import { authClient } from '~/lib/auth/client';
import {
    type UpdateEmailInput,
    updateEmailInputSchema,
    type UpdateNameInput,
    updateNameInputSchema,
} from '~/lib/schemas/auth';

export function UpdateNameForm({
    currentName,
    email,
}: {
    currentName: string;
    email: null | string;
}) {
    const router = useRouter();
    const [namePending, startNameTransition] = useTransition();
    const [emailPending, startEmailTransition] = useTransition();
    const [editingEmail, setEditingEmail] = useState(false);

    const form = useForm<UpdateNameInput>({
        defaultValues: { currentName, name: currentName },
        mode: 'onTouched',
        resolver: zodResolver(updateNameInputSchema),
    });

    const emailForm = useForm<UpdateEmailInput>({
        defaultValues: { email: email ?? '' },
        mode: 'onTouched',
        resolver: zodResolver(updateEmailInputSchema),
    });

    const onSubmit = (data: UpdateNameInput) => {
        startNameTransition(async () => {
            const result = await authClient.updateUser({ name: data.name });
            if (result.error) {
                toast.error(result.error.message ?? 'Could not save name.');
                return;
            }
            toast.success('Name updated.');
            router.refresh();
        });
    };

    const onSaveEmail = emailForm.handleSubmit((data) => {
        const trimmed = data.email.trim();
        if (trimmed === (email ?? '')) {
            setEditingEmail(false);
            return;
        }
        startEmailTransition(async () => {
            const result = await authClient.changeEmail({
                callbackURL: '/profile',
                newEmail: trimmed,
            });
            if (result.error) {
                toast.error(result.error.message ?? 'Could not update email.');
                return;
            }
            toast.success(
                'Verification sent. Check your inbox to confirm the change.',
            );
            setEditingEmail(false);
        });
    });

    const onCancelEmail = () => {
        emailForm.reset({ email: email ?? '' });
        setEditingEmail(false);
    };

    const isShowEmailEditor = editingEmail || !email;

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form
                    className={`app-profile__name-form flex flex-col gap-3`}
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Display name</FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="name"
                                        placeholder="Your name"
                                        type="text"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button
                        className="mt-2 self-start"
                        disabled={namePending}
                        type="submit"
                    >
                        {namePending ? 'Saving…' : 'Save changes'}
                    </Button>
                </form>
            </Form>
            <Form {...emailForm}>
                <form className="flex flex-col gap-2" onSubmit={onSaveEmail}>
                    {isShowEmailEditor ? (
                        <FormField
                            control={emailForm.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <FormControl>
                                            <Input
                                                autoComplete="email"
                                                placeholder="your@email.com"
                                                type="email"
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="flex gap-2">
                                            <Button
                                                disabled={
                                                    emailPending ||
                                                    !field.value.trim()
                                                }
                                                type="submit"
                                                variant="outline"
                                            >
                                                {emailPending
                                                    ? 'Saving…'
                                                    : 'Save'}
                                            </Button>
                                            {email && (
                                                <Button
                                                    disabled={emailPending}
                                                    onClick={onCancelEmail}
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : (
                        <div className="flex flex-col gap-2">
                            <Label>Email</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    className="opacity-60"
                                    disabled
                                    readOnly
                                    value={email}
                                />
                                <Button
                                    onClick={() => setEditingEmail(true)}
                                    type="button"
                                    variant="outline"
                                >
                                    Change
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
            </Form>
        </div>
    );
}
