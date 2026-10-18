import Link from 'next/link';

import { Button } from '~/components/ui/button';
import { routes } from '~/lib/site/routes';

export function EnterBalancesButton() {
    return (
        <Button asChild size="sm" variant="outline">
            <Link href={routes.propCalculator.accounts.review}>
                Enter balances
            </Link>
        </Button>
    );
}
