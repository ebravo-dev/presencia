import { seedSharedClassData } from '../src/scripts/seed-shared-class.js';

seedSharedClassData().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
