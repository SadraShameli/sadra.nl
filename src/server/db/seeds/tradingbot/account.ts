import { db } from '../..';
import { DatabaseSeeder } from '../../types';

import { tradingBotAccount } from '../../schemas/tradingBot';

export default class AccountSeed extends DatabaseSeeder {
    async run() {
        await db.insert(tradingBotAccount).values([
            {
                server: 'metatrader5.com',
                login: 'test',
                password: 'test',
                enabled: false,
            },
        ]);
    }
}
