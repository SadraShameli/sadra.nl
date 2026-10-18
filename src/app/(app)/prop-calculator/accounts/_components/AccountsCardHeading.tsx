import { type ReactNode } from 'react';

import { CardTitle } from '~/components/ui/card';

export function AccountsCardHeading({
    children,
}: {
    readonly children: ReactNode;
}) {
    return <CardTitle as="h2">{children}</CardTitle>;
}
