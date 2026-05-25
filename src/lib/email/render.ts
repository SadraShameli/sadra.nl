import type { ReactElement } from 'react';

import { render as renderEmail } from '@react-email/render';

export function renderEmailToHtml(element: ReactElement): Promise<string> {
    return renderEmail(element);
}
