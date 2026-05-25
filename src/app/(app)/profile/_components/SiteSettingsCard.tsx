'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Music2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Textarea } from '~/components/ui/Textarea';
import {
    type SetSpotifyEmbedHtmlInput,
    setSpotifyEmbedHtmlSchema,
} from '~/lib/schemas/site-setting';
import { api } from '~/trpc/react';

export function SiteSettingsCard() {
    const utils = api.useUtils();
    const current = api.user.settings.getSpotifyEmbed.useQuery();
    const update = api.user.settings.setSpotifyEmbed.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Spotify embed updated');
            await utils.user.settings.getSpotifyEmbed.invalidate();
        },
    });

    const form = useForm<SetSpotifyEmbedHtmlInput>({
        defaultValues: { html: '' },
        mode: 'onTouched',
        resolver: zodResolver(setSpotifyEmbedHtmlSchema),
    });

    useEffect(() => {
        if (current.data) form.reset({ html: current.data });
    }, [current.data, form]);

    const onSubmit = form.handleSubmit((values) => {
        update.mutate({ html: values.html });
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Music2 className="size-4" />
                    Spotify embed
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                        <FormField
                            control={form.control}
                            name="html"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Embed iframe</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            className="font-mono text-xs"
                                            placeholder='<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/…" …></iframe>'
                                            rows={6}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        On Spotify: Share → Embed track → Copy.
                                        Paste the entire iframe snippet here
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end">
                            <Button disabled={update.isPending} type="submit">
                                {update.isPending ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
