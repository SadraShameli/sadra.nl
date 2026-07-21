import { environment } from '~/environment';

import { Mailer } from './mailer';
import {
    FallbackEmailProvider,
    LettermintProvider,
    ResendProvider,
} from './provider';

export type { EmailMessage } from './message';
export { ContactFormEmail } from './messages/contact-form';
export { DeviceCreatedEmail } from './messages/device-created';
export { EmailVerificationEmail } from './messages/email-verification';
export { LocationCreatedEmail } from './messages/location-created';
export { LoudnessAlertEmail } from './messages/loudness-alert';
export { MagicLinkEmail } from './messages/magic-link';
export { PasswordResetEmail } from './messages/password-reset';
export { ReadingCreatedEmail } from './messages/reading-created';
export { RecordingCreatedEmail } from './messages/recording-created';
export { SignUpNotificationEmail } from './messages/signup-notification';

export const mailer = new Mailer(
    new FallbackEmailProvider(
        new LettermintProvider(environment.LETTERMINT_PROJECT_TOKEN),
        new ResendProvider(environment.RESEND_API_KEY),
    ),
);
