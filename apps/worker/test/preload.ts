import { assertTestDatabase } from "@bloody-roar/database/test-guard";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) assertTestDatabase(testDatabaseUrl);
process.env.DATABASE_URL = testDatabaseUrl || "postgresql://unit-tests.invalid:5432/no_database_unit_tests";
process.env.DIRECT_URL = process.env.DATABASE_URL;
