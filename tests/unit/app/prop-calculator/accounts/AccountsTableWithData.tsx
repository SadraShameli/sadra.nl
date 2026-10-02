import { AccountsTableWithValues } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { DetailHeaderFigures } from '~/app/(app)/prop-calculator/accounts/_components/detail/DetailHeaderFigures';
import {
    useAccountDetailValues,
    useAccountValuesWithEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';

export function AccountDetailValuesProbe({
    accountId,
    userId,
}: {
    readonly accountId: string;
    readonly userId: string;
}) {
    const { values } = useAccountDetailValues({ accountId, userId });
    return <DetailHeaderFigures accountId={accountId} values={values} />;
}

export function AccountsTable({ userId }: { readonly userId?: string }) {
    const { values } = useAccountValuesWithEngine({ userId });
    return <AccountsTableWithValues values={values} />;
}

export function DetailHeaderFiguresWithData({
    accountId,
    userId,
}: {
    readonly accountId: string;
    readonly userId: string;
}) {
    const { values } = useAccountValuesWithEngine({ accountId, userId });
    return <DetailHeaderFigures accountId={accountId} values={values} />;
}
