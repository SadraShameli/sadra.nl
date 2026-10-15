import * as relationsModule from './relations';
import * as accountingSchema from './schemas/accounting';
import * as authSchema from './schemas/auth';
import * as iotSchema from './schemas/iot';
import * as liftingSchema from './schemas/lifting';
import * as mainSchema from './schemas/main';
import * as notificationSchema from './schemas/notification';
import * as observabilitySchema from './schemas/observability';
import * as propSchema from './schemas/prop';
import * as themeSchema from './schemas/theme';
import * as tradingSchema from './schemas/trading';

export const databaseSchema = {
    ...mainSchema,
    ...iotSchema,
    ...authSchema,
    ...tradingSchema,
    ...notificationSchema,
    ...observabilitySchema,
    ...accountingSchema,
    ...liftingSchema,
    ...propSchema,
    ...themeSchema,
    ...relationsModule,
};
