import { isRoot } from '~/lib/auth/roles';
import { readSession } from '~/lib/auth/session';

import { NavGroupColumn } from './NavGroupColumn';
import { ACCOUNTING_NAV_GROUP, RESUME_NAV_GROUP } from './siteNavigation';

export async function RootAccountingGroup() {
    const session = await readSession();
    return isRoot(session?.user.role) ? (
        <NavGroupColumn group={ACCOUNTING_NAV_GROUP} />
    ) : null;
}

export async function RootResumeGroup() {
    const session = await readSession();
    return isRoot(session?.user.role) ? (
        <NavGroupColumn group={RESUME_NAV_GROUP} />
    ) : null;
}
