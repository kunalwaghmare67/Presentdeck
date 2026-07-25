import type { UserRole, AuthSession } from '../types';

interface HashedAccount {
  username: string;
  role: UserRole;
  passwordHash: string;
}

const AUTH_SALT = 'presentdeck_salt_v1_2026';

const RAW_SEED_ACCOUNTS = [
  { username: 'Kunal', role: 'master' as UserRole, seedPass: '412760' },
  { username: 'Kunal1', role: 'normal' as UserRole, seedPass: 'Kunal@555' },
  { username: 'Aashay', role: 'normal' as UserRole, seedPass: 'Rodolf2023' },
];

let HASHED_ACCOUNTS_CACHE: HashedAccount[] | null = null;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + AUTH_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getHashedAccounts(): Promise<HashedAccount[]> {
  if (HASHED_ACCOUNTS_CACHE) return HASHED_ACCOUNTS_CACHE;
  HASHED_ACCOUNTS_CACHE = await Promise.all(
    RAW_SEED_ACCOUNTS.map(async acc => ({
      username: acc.username,
      role: acc.role,
      passwordHash: await hashPassword(acc.seedPass),
    }))
  );
  return HASHED_ACCOUNTS_CACHE;
}

export async function authenticateUser(usernameInput: string, passwordInput: string): Promise<AuthSession | null> {
  const cleanUsername = usernameInput.trim();
  const accounts = await getHashedAccounts();
  const account = accounts.find(a => a.username.toLowerCase() === cleanUsername.toLowerCase());

  if (!account) {
    return null;
  }

  const computedHash = await hashPassword(passwordInput);
  if (computedHash !== account.passwordHash) {
    return null;
  }

  const session: AuthSession = {
    username: account.username,
    role: account.role,
    token: `session_${account.username}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    loginTime: new Date().toISOString(),
  };

  return session;
}
