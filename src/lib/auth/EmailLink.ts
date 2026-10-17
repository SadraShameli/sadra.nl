import { formatDuration, intervalToDuration } from 'date-fns';

export enum EmailLink {
    SignIn = 'sign-in',
    Verification = 'verification',
}

export const EMAIL_LINK_LIFETIME_SECONDS: Record<EmailLink, number> = {
    [EmailLink.SignIn]: 5 * 60,
    [EmailLink.Verification]: 60 * 60,
};

const EMAIL_LINK_NAME: Record<EmailLink, string> = {
    [EmailLink.SignIn]: 'a sign-in link',
    [EmailLink.Verification]: 'a verification link',
};

export function emailLinkLifetimeText(link: EmailLink): string {
    return formatDuration(
        intervalToDuration({
            end: EMAIL_LINK_LIFETIME_SECONDS[link] * 1000,
            start: 0,
        }),
    );
}

export function emailLinkSentText(link: EmailLink): string {
    return `We've sent you ${EMAIL_LINK_NAME[link]}. Click it to continue. The link expires in ${emailLinkLifetimeText(link)}.`;
}
