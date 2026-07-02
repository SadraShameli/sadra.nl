'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { Textarea } from '~/components/ui/Textarea';
import { type ContactInput, contactInputSchema } from '~/lib/schemas/contact';
import { api } from '~/trpc/react';

export function ContactForm() {
    const form = useForm<ContactInput>({
        defaultValues: { email: '', honeypot: '', message: '', name: '' },
        resolver: zodResolver(contactInputSchema),
    });

    const send = api.contact.send.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
            toast.success("Thanks — I'll reply soon.");
            form.reset();
        },
    });

    const onSubmit = form.handleSubmit((values) => send.mutate(values));

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                noValidate
                onSubmit={onSubmit}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input autoComplete="name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="email"
                                    type="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Message</FormLabel>
                            <FormControl>
                                <Textarea className="min-h-32" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-2499.75 h-0 w-0 overflow-hidden"
                >
                    <label>
                        Leave this empty
                        <input
                            autoComplete="off"
                            tabIndex={-1}
                            type="text"
                            {...form.register('honeypot')}
                        />
                    </label>
                </div>
                <div className="mt-2 flex justify-end">
                    <Button disabled={send.isPending} type="submit">
                        {send.isPending ? 'Sending…' : 'Send'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
