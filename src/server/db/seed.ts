import { endDb } from '.';
import { DatabaseSeeder } from './types';

try {
    await DatabaseSeeder.runAll();
} finally {
    await endDb();
}
