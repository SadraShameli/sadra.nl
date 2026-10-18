'use client';

import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

import { LIFTING_NAV } from './liftingNav';

export function LiftingSubnav() {
    return <RouteSubnav className="app-lifting__subnav" items={LIFTING_NAV} />;
}
