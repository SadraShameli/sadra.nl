import { type ReactNode } from 'react';

import { CardTitle } from '~/components/ui/Card';

export function AccountsCardHeading({
    children,
}: {
    readonly children: ReactNode;
}) {
    return (
        <CardTitle aria-level={2} role="heading">
            {children}
        </CardTitle>
    );
}
