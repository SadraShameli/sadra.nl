import type { ReactElement } from 'react';

import { render } from '@react-email/render';

export abstract class EmailMessage {
    abstract readonly subject: string;
    abstract readonly to: string;

    headers(): Readonly<Record<string, string>> {
        return {};
    }

    render(): Promise<string> {
        return render(this.content());
    }

    renderText(): Promise<string> {
        return render(this.content(), { plainText: true });
    }

    protected abstract content(): ReactElement;
}
