import { isRoot } from '~/lib/auth/roles';
import { readSession } from '~/lib/auth/session';

import { NavGroupColumn } from './NavGroupColumn';
import { NavProductCard } from './NavProductCard';
import { ACCOUNTING_NAV_PRODUCT, RESUME_NAV_GROUP } from './siteNavigation';

export async function RootAccountingProduct() {
    const session = await readSession();
    return isRoot(session?.user.role) ? (
        <NavProductCard product={ACCOUNTING_NAV_PRODUCT} />
    ) : null;
}

export async function RootResumeGroup() {
    const session = await readSession();
    return isRoot(session?.user.role) ? (
        <NavGroupColumn group={RESUME_NAV_GROUP} />
    ) : null;
}
