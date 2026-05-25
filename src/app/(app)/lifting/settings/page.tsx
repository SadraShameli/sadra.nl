import { redirect } from 'next/navigation';

import { routes } from '~/lib/site/routes';

export default function LiftingSettingsRedirect() {
    redirect(routes.lifting.settings);
}
