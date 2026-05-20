'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
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
import { Label } from '~/components/ui/Label';
import { updateEmail, updateName } from '~/lib/auth/actions';
import {
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
    const [namePending, startNameTransition] = useTransition();
    const [emailPending, startEmailTransition] = useTransition();
    const [emailDraft, setEmailDraft] = useState(email ?? '');
    const [editingEmail, setEditingEmail] = useState(false);

    const form = useForm<UpdateNameInput>({
        defaultValues: { currentName, name: currentName },
        mode: 'onTouched',
        resolver: zodResolver(updateNameInputSchema),
    });

    const onSubmit = (data: UpdateNameInput) => {
        startNameTransition(async () => {
            await updateName(data);
        });
    };

    const onSaveEmail = () => {
        const trimmed = emailDraft.trim();
        if (trimmed === (email ?? '')) {
            setEditingEmail(false);
            return;
        }
        const parsed = updateEmailInputSchema.safeParse({ email: trimmed });
        if (!parsed.success) return;
        startEmailTransition(async () => {
            await updateEmail(parsed.data);
        });
    };

    const onCancelEmail = () => {
        setEmailDraft(email ?? '');
        setEditingEmail(false);
    };

    const showEmailEditor = editingEmail || !email;

    return (
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
                <div className="flex flex-col gap-2">
                    <Label>Email</Label>
                    {showEmailEditor ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                                autoComplete="email"
                                onChange={(e) => setEmailDraft(e.target.value)}
                                placeholder="your@email.com"
                                type="email"
                                value={emailDraft}
                            />
                            <div className="flex gap-2">
                                <Button
                                    disabled={
                                        emailPending || !emailDraft.trim()
                                    }
                                    onClick={onSaveEmail}
                                    type="button"
                                    variant="outline"
                                >
                                    {emailPending ? 'Saving…' : 'Save'}
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
                    ) : (
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
                    )}
                </div>
                <Button
                    className="mt-2 self-start"
                    disabled={namePending}
                    type="submit"
                >
                    {namePending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Form>
    );
}
