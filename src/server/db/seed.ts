import { endDb } from '.';
import { DatabaseSeeder } from './types';

async function main() {
    console.log('Seeding database');

    await DatabaseSeeder.runAll();
}

main()
    .then(() => {
        console.log('Seeding complete');
    })
    .catch((e) => {
        console.error(e);
    })
    .finally(() => {
        void (async () => {
            await endDb();
            process.exit(0);
        })();
    });
