import { isRoot } from '~/lib/auth/roles';
import { readSession } from '~/lib/auth/session';

import { ResumeLinkButton } from './PortfolioHero';

export default async function RootResumeLink() {
    const session = await readSession();
    return isRoot(session?.user.role) ? <ResumeLinkButton /> : null;
}
