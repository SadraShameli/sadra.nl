import { endDb } from '.';
import { DatabaseSeeder } from './types';

async function main() {
    await DatabaseSeeder.runAll();
}

main()
    .catch((e) => {
        console.error(e);
    })
    .finally(() => {
        void (async () => {
            await endDb();
            process.exit(0);
        })();
    });
