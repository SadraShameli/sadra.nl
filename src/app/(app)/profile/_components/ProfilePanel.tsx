import { type ReactNode } from 'react';

import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card';

export function ProfilePanel({
    action,
    children,
    description,
    title,
}: {
    action?: ReactNode;
    children: ReactNode;
    description: string;
    title: string;
}) {
    return (
        <Card className="min-w-0 gap-5">
            <CardHeader className="grid items-start gap-x-4 gap-y-1.5">
                <CardTitle as="h2" className="text-base">
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
                {action !== undefined && (
                    <CardAction className="flex items-center gap-2">
                        {action}
                    </CardAction>
                )}
            </CardHeader>
            <CardContent className="min-w-0">{children}</CardContent>
        </Card>
    );
}
