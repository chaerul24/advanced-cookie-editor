/**
 * Advanced Cookie Editor - Automated Test Runner
 * Executes unit tests for crypto, validation, and serialization modules.
 */

import { runCryptoTests } from './crypto.test.js';
import { runValidationTests } from './validation.test.js';
import { runSerializerTests } from './serializer.test.js';
import { runImportExportTests } from './import-export.test.js';

async function main() {
  console.log('========================================================');
  console.log('  ADVANCED COOKIE EDITOR - AUTOMATED TEST SUITE');
  console.log('========================================================\n');

  const suites = [
    await runCryptoTests(),
    runValidationTests(),
    runSerializerTests(),
    await runImportExportTests()
  ];

  let totalTests = 0;
  let totalPass = 0;
  let totalFail = 0;

  for (const suite of suites) {
    console.log(`[SUITE] ${suite.suite}`);
    for (const test of suite.results) {
      totalTests++;
      if (test.status === 'PASS') {
        totalPass++;
        console.log(`  ✓ PASS: ${test.name}`);
      } else {
        totalFail++;
        console.error(`  ✗ FAIL: ${test.name}`);
        console.error(`    Details: ${test.error}`);
      }
    }
    console.log('');
  }

  console.log('========================================================');
  console.log(`Summary: ${totalPass} Passed, ${totalFail} Failed, ${totalTests} Total`);
  console.log('========================================================');

  if (totalFail > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
