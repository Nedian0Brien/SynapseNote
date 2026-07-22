import { runDatabaseResourceRegression } from '../src/database-resource-regression.ts';

const result = runDatabaseResourceRegression();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
