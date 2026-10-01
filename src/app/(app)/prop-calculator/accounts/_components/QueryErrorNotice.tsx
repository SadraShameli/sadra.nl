import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';

interface QueryErrorNoticeProperties {
    readonly message: string;
    readonly title: string;
}

export function QueryErrorNotice({ message, title }: QueryErrorNoticeProperties) {
    return (
        <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}
