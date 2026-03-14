import { closeDatabase, getDatabase } from '../utils/database';

function run(): void {
  try {
    getDatabase();
    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

run();
