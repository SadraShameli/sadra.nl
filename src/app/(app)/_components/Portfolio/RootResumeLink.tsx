import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';

import { ResumeLinkButton } from './PortfolioHero';

export default async function RootResumeLink() {
    const session = await getServerSession();
    return isRoot(session?.user.role) ? <ResumeLinkButton /> : null;
}
