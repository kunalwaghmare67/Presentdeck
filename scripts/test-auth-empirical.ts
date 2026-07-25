import { authenticateUser } from '../src/config/authConfig';

async function runEmpiricalTests() {
  console.log('=== EMPIRICAL AUTHENTICATION & STRESS TEST SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`✓ PASS: ${testName}`);
    } else {
      failed++;
      console.error(`✗ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
    }
  }

  // 1. Seed Accounts Authentication Tests
  console.log('--- 1. Seed Account Valid Logins ---');
  const sessionKunal = await authenticateUser('Kunal', '412760');
  assert(sessionKunal !== null && sessionKunal.role === 'master' && sessionKunal.username === 'Kunal', 
    'Account Kunal login with password 412760', `Got: ${JSON.stringify(sessionKunal)}`);

  const sessionKunal1 = await authenticateUser('Kunal1', 'Kunal@555');
  assert(sessionKunal1 !== null && sessionKunal1.role === 'normal' && sessionKunal1.username === 'Kunal1', 
    'Account Kunal1 login with password Kunal@555', `Got: ${JSON.stringify(sessionKunal1)}`);

  const sessionAashay = await authenticateUser('Aashay', 'Rodolf2023');
  assert(sessionAashay !== null && sessionAashay.role === 'normal' && sessionAashay.username === 'Aashay', 
    'Account Aashay login with password Rodolf2023', `Got: ${JSON.stringify(sessionAashay)}`);

  // 2. Username Case-Insensitivity & Trimming
  console.log('\n--- 2. Username Case-Insensitivity & Trimming ---');
  const sessionKunalLower = await authenticateUser('kunal', '412760');
  assert(sessionKunalLower !== null && sessionKunalLower.username === 'Kunal', 'Lowercase username "kunal"');

  const sessionKunalUpper = await authenticateUser('KUNAL1', 'Kunal@555');
  assert(sessionKunalUpper !== null && sessionKunalUpper.username === 'Kunal1', 'Uppercase username "KUNAL1"');

  const sessionAashayMixed = await authenticateUser('aaSHay', 'Rodolf2023');
  assert(sessionAashayMixed !== null && sessionAashayMixed.username === 'Aashay', 'Mixed-case username "aaSHay"');

  const sessionPaddedUser = await authenticateUser('  Kunal  ', '412760');
  assert(sessionPaddedUser !== null && sessionPaddedUser.username === 'Kunal', 'Padded username "  Kunal  "');

  // 3. Invalid Credentials & Edge Cases
  console.log('\n--- 3. Invalid Credentials & Edge Cases ---');
  const badPassKunal = await authenticateUser('Kunal', 'wrongpassword');
  assert(badPassKunal === null, 'Kunal with wrong password -> null');

  const badPassKunal1 = await authenticateUser('Kunal1', '412760');
  assert(badPassKunal1 === null, 'Kunal1 with Kunal password -> null');

  const paddedPass = await authenticateUser('Kunal', '412760 ');
  assert(paddedPass === null, 'Password with trailing space -> null');

  const nonExistentUser = await authenticateUser('NonExistent', '412760');
  assert(nonExistentUser === null, 'Non-existent username -> null');

  const emptyUser = await authenticateUser('', '412760');
  assert(emptyUser === null, 'Empty username string -> null');

  const emptyPass = await authenticateUser('Kunal', '');
  assert(emptyPass === null, 'Empty password string -> null');

  const bothEmpty = await authenticateUser('', '');
  assert(bothEmpty === null, 'Both username & password empty -> null');

  const whitespaceUser = await authenticateUser('   ', '412760');
  assert(whitespaceUser === null, 'Whitespace-only username -> null');

  // 4. Session Token Format & Randomness
  console.log('\n--- 4. Session Structure & Token Uniqueness ---');
  if (sessionKunal) {
    assert(sessionKunal.token.startsWith('session_Kunal_'), 'Token starts with session_Kunal_');
    assert(typeof sessionKunal.loginTime === 'string' && !isNaN(Date.parse(sessionKunal.loginTime)), 'loginTime is valid ISO string');
  }

  // Stress test: Generate 500 session tokens and ensure 100% uniqueness
  const tokenSet = new Set<string>();
  let collisions = 0;
  for (let i = 0; i < 500; i++) {
    const s = await authenticateUser('Kunal', '412760');
    if (s) {
      if (tokenSet.has(s.token)) collisions++;
      tokenSet.add(s.token);
    }
  }
  assert(collisions === 0 && tokenSet.size === 500, '500 rapid logins produced 500 unique session tokens');

  // 5. Performance / Latency Stress Test
  console.log('\n--- 5. Authentication Latency Benchmark ---');
  const t0 = performance.now();
  const benchCount = 100;
  for (let i = 0; i < benchCount; i++) {
    await authenticateUser('Kunal', '412760');
  }
  const t1 = performance.now();
  const avgMs = (t1 - t0) / benchCount;
  console.log(`Average authentication duration: ${avgMs.toFixed(3)} ms per request`);
  assert(avgMs < 10, `Authentication average latency under 10ms (actual: ${avgMs.toFixed(3)}ms)`);

  console.log(`\n==================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================`);

  if (failed > 0) process.exit(1);
}

runEmpiricalTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
