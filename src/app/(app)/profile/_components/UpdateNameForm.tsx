'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition, useState } from 'react';
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
import { updateEmail, updateName } from '~/lib/auth-actions';
import {
    updateEmailInputSchema,
    updateNameInputSchema,
    type UpdateNameInput,
} from '~/lib/schemas/auth';

export function UpdateNameForm({
    currentName,
    email,
}: {
    currentName: string;
    email: string | null;
}) {
    const [namePending, startNameTransition] = useTransition();
    const [emailPending, startEmailTransition] = useTransition();
    const [emailDraft, setEmailDraft] = useState('');

    const form = useForm<UpdateNameInput>({
        resolver: zodResolver(updateNameInputSchema),
        defaultValues: { name: currentName, currentName },
        mode: 'onTouched',
    });

    const onSubmit = (data: UpdateNameInput) => {
        startNameTransition(async () => {
            await updateName(data);
        });
    };

    const onSaveEmail = () => {
        const parsed = updateEmailInputSchema.safeParse({ email: emailDraft });
        if (!parsed.success) return;
        startEmailTransition(async () => {
            await updateEmail(parsed.data);
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
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Display name</FormLabel>
                            <FormControl>
                                <Input
                                    type="text"
                                    placeholder="Your name"
                                    autoComplete="name"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="space-y-2">
                    <Label>Email</Label>
                    {email ? (
                        <Input
                            value={email}
                            disabled
                            readOnly
                            className="opacity-50"
                        />
                    ) : (
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                placeholder="your@email.com"
                                autoComplete="email"
                                value={emailDraft}
                                onChange={(e) => setEmailDraft(e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                disabled={emailPending || !emailDraft.trim()}
                                onClick={onSaveEmail}
                            >
                                {emailPending ? 'Saving…' : 'Save email'}
                            </Button>
                        </div>
                    )}
                </div>
                <Button
                    type="submit"
                    className="mt-2 self-start"
                    disabled={namePending}
                >
                    {namePending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Form>
    );
}
