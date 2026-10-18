import { EmailMessage } from '~/lib/email/message';
import { profileTabs, profileTabUrl } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

export abstract class NotificationEmail extends EmailMessage {
    override headers(): Readonly<Record<string, string>> {
        return { 'List-Unsubscribe': `<${notificationSettingsUrl()}>` };
    }
}

export function notificationSettingsUrl(): string {
    return `${getPublicSiteOrigin()}${profileTabUrl(profileTabs.sensorHub)}`;
}
