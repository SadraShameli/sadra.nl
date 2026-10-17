'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import {
    type CredentialCreateInput,
    credentialCreateSchema,
} from '~/lib/schemas/accounting';
import { api } from '~/trpc/react';

import { CredentialFormFields, defaultMetaFor } from './CredentialFormFields';
import { useRefreshCredentials } from './useRefreshCredentials';

export function NewCredentialDialog() {
    const descriptors = useMemo(() => CredentialRegistry.instance.list(), []);
    const onCreated = useRefreshCredentials();
    const [open, setOpen] = useState(false);
    const initialDescriptor = descriptors[0];
    const creationMutation = api.accounting.credentials.create.useMutation();
    const form = useForm<
        z.input<typeof credentialCreateSchema>,
        unknown,
        CredentialCreateInput
    >({
        defaultValues: initialDescriptor
            ? {
                  kind: initialDescriptor.id,
                  label: '',
                  meta: defaultMetaFor(initialDescriptor),
                  secret: '',
              }
            : undefined,
        resolver: zodResolver(credentialCreateSchema),
    });

    const kind = form.watch('kind');
    const label = form.watch('label');
    const secret = form.watch('secret');
    const meta = form.watch('meta') ?? {};
    const descriptor = descriptors.find((d) => d.id === kind);

    if (!descriptor) {
        return (
            <Button disabled>
                <Plus className="size-4" /> Add credential
            </Button>
        );
    }

    const reset = () => {
        const first = descriptors[0];
        if (!first) return;
        form.reset({
            kind: first.id,
            label: '',
            meta: defaultMetaFor(first),
            secret: '',
        });
    };

    const onSubmit = form.handleSubmit(async (values) => {
        try {
            await creationMutation.mutateAsync({
                kind: values.kind,
                label: values.label.trim(),
                meta: values.meta,
                secret: values.secret?.trim(),
            });
            toast.success('Credential added');
            setOpen(false);
            await onCreated();
            reset();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not save credential',
            );
        }
    });

    return (
        <Dialog
            onOpenChange={(o) => {
                setOpen(o);
                if (o) {
                    form.setValue('meta', defaultMetaFor(descriptor));
                } else {
                    reset();
                }
            }}
            open={open}
        >
            <DialogTrigger asChild>
                <Button>
                    <Plus className="size-4" /> Add credential
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New credential</DialogTitle>
                </DialogHeader>

                <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                    <CredentialFormFields
                        descriptor={descriptor}
                        descriptors={descriptors}
                        kindEditable
                        label={label}
                        meta={meta}
                        onKindChange={(id) => {
                            const next = descriptors.find((d) => d.id === id);
                            form.setValue('kind', id, {
                                shouldDirty: true,
                                shouldValidate: true,
                            });
                            form.setValue(
                                'meta',
                                next ? defaultMetaFor(next) : {},
                                { shouldDirty: true, shouldValidate: true },
                            );
                        }}
                        onLabelChange={(v) =>
                            form.setValue('label', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        onMetaChange={(v) =>
                            form.setValue('meta', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        onSecretChange={(v) =>
                            form.setValue('secret', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        secret={secret ?? ''}
                        secretRequired={descriptor.requiresSecret !== false}
                    />

                    {creationMutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4" />
                            <AlertDescription>
                                {creationMutation.error.message}
                            </AlertDescription>
                        </Alert>
                    )}

                    <DialogFooter>
                        <Button
                            disabled={creationMutation.isPending}
                            onClick={() => setOpen(false)}
                            type="button"
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={creationMutation.isPending}
                            type="submit"
                        >
                            {creationMutation.isPending && (
                                <Spinner className="size-3" />
                            )}
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
