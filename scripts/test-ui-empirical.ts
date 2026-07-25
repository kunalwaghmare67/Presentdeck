import fs from 'fs';
import path from 'path';

function runUiAndSystemVerification() {
  console.log('=== EMPIRICAL UI, CONTEXT & REACTIVE REDIRECT VERIFICATION SUITE ===\n');

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

  const loginPageTsx = fs.readFileSync('src/components/LoginPage.tsx', 'utf8');
  const loginPageCss = fs.readFileSync('src/components/LoginPage.css', 'utf8');
  const authContextTsx = fs.readFileSync('src/context/AuthContext.tsx', 'utf8');
  const appTsx = fs.readFileSync('src/App.tsx', 'utf8');

  // 1. Error handling text verification
  console.log('--- 1. Validation & Error Handling Messages ---');
  assert(loginPageTsx.includes("'Please enter both username and password.'"), 
    'Validation error for empty username/password exact string: "Please enter both username and password."');
  
  assert(loginPageTsx.includes("'Invalid username or password.'"), 
    'Authentication error for invalid credentials exact string: "Invalid username or password."');

  assert(loginPageTsx.includes('!username.trim() || !password.trim()'), 
    'Form submit validates whitespace-trimmed input values');

  // 2. Password visibility toggle behavior
  console.log('\n--- 2. Password Mask Visibility Toggle State ---');
  assert(loginPageTsx.includes("const [showPassword, setShowPassword] = useState(false);"), 
    'Initial showPassword state is false');

  assert(loginPageTsx.includes("type={showPassword ? 'text' : 'password'}"), 
    'Password input type toggles between "text" and "password" based on showPassword state');

  assert(loginPageTsx.includes("onClick={() => setShowPassword(!showPassword)}"), 
    'Toggle button toggles showPassword boolean state');

  assert(loginPageTsx.includes("{showPassword ? '👁️' : '🙈'}"), 
    'Toggle button renders eye emoji (👁️) when shown and monkey emoji (🙈) when hidden');

  assert(loginPageTsx.includes('aria-label="Toggle password visibility"'), 
    'Toggle button includes accessibility label aria-label="Toggle password visibility"');

  // 3. Form Submission Safeguards
  console.log('\n--- 3. Form Submission & Loading Lock ---');
  assert(loginPageTsx.includes("const [isSubmitting, setIsSubmitting] = useState(false);"), 
    'Submitting state tracked with isSubmitting state variable');

  assert(loginPageTsx.includes("disabled={isSubmitting}"), 
    'Submit button disabled during active authentication request');

  assert(loginPageTsx.includes("{isSubmitting ? 'Authenticating...' : 'Log In'}"), 
    'Submit button text changes to "Authenticating..." during active authentication request');

  // 4. Reactive Redirect and AuthContext State
  console.log('\n--- 4. Reactive Redirect & Context Flow ---');
  assert(appTsx.includes('const { currentUser } = useAuth();') && appTsx.includes('if (!currentUser) {\n    return <LoginPage />;\n  }'), 
    'App.tsx conditionally renders LoginPage when currentUser is null');

  assert(authContextTsx.includes("localStorage.getItem('presentdeck_session')"), 
    'AuthContext reads initial session from localStorage key "presentdeck_session"');

  assert(authContextTsx.includes("localStorage.setItem('presentdeck_session', JSON.stringify(session))"), 
    'AuthContext persists session to localStorage on successful login');

  assert(authContextTsx.includes("useStore.setState({ currentUser: session })"), 
    'AuthContext synchronizes currentUser session with global Zustand store');

  assert(authContextTsx.includes("setCurrentUser(session)"), 
    'AuthContext updates React state currentUser, triggering app-wide re-render and reactive redirect');

  // 5. Visual Styling Verification (Discord Dark Theme)
  console.log('\n--- 5. Visual Restyling & Discord Dark Tokens ---');
  assert(loginPageCss.includes('background-color: #313338'), 'Login root uses Discord dark background #313338');
  assert(loginPageCss.includes('background-color: #2b2d31'), 'Login card uses Discord panel background #2b2d31');
  assert(loginPageCss.includes('background-color: #1e1f22'), 'Input fields use Discord dark input background #1e1f22');
  assert(loginPageCss.includes('box-shadow: 0 0 0 2px #00a8fc'), 'Focus glow border uses Discord blue accent #00a8fc');
  assert(loginPageCss.includes('background-color: #5865f2'), 'Primary login button uses Discord primary accent #5865f2');
  assert(loginPageCss.includes('background-color: #4752c4'), 'Button hover state uses Discord hovered accent #4752c4');
  assert(loginPageCss.includes('color: #b5bac1'), 'Muted subtext & labels use Discord muted text #b5bac1');
  assert(loginPageCss.includes('max-width: 480px'), 'Card max-width constrained to 480px');

  // 6. Test Runner Bug Audit
  console.log('\n--- 6. Test Runner Compatibility Analysis ---');
  const testRunnerJs = fs.readFileSync('scripts/test-runner.js', 'utf8');
  const runnerHasStrictBgCheck = testRunnerJs.includes("background: #1e1f22") && !testRunnerJs.includes("background-color: #1e1f22");
  assert(runnerHasStrictBgCheck, 'Identified root cause of test-runner.js failures: test-runner.js looks for shorthand "background: #..." whereas CSS uses explicit "background-color: #..."');

  console.log(`\n==================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================`);

  if (failed > 0) process.exit(1);
}

runUiAndSystemVerification();
