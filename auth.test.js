const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createController, BINDING_KEY, CACHE_KEY, GUEST_KEY, SESSION_KEY, SEVEN_DAYS } = require('./auth');

function fixture({ count = 0, connected = true, approved = true, userId = 'first', team = 'A' } = {}) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let online = connected;
  let user = { id: userId, email: `${userId}@example.test` };
  let profile = { id: userId, full_name: 'Inspector', role: 'inspector', approved, team };
  let userError = null;
  let signOutError = null;
  let signOutThrows = false;
  let signUpRequest = null;
  let signUpError = null;
  let signUpSession = null;
  let getUserCalls = 0;
  let now = 1_800_000_000_000;
  const client = {
    auth: {
      getUser: async () => { getUserCalls++; return { data: { user: userError ? null : user }, error: userError }; },
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signUp: async request => { signUpRequest = request; return { data: { user: { id: 'new-user' }, session: signUpSession }, error: signUpError }; },
      signOut: async () => { if (signOutThrows) throw signOutError || new Error('Network unavailable'); return { error: signOutError }; }
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }) })
  };
  const controller = createController({ client, storage, localCount: () => count, online: () => online, now: () => now });
  return { controller, storage, getUserCalls: () => getUserCalls, signUpRequest: () => signUpRequest, setSignUpError: error => { signUpError = error; }, setSignUpSession: session => { signUpSession = session; }, setOnline: value => { online = value; }, setApproved: value => { profile = { ...profile, approved: value }; }, setUserError: error => { userError = error; }, setSignOutError: error => { signOutError = error; }, setSignOutThrows: value => { signOutThrows = value; }, setUser: id => { user = { id, email: `${id}@example.test` }; profile = { ...profile, id }; }, advance: duration => { now += duration; } };
}

test('legacy records require explicit binding and stay bound after sign-out', async () => {
  const f = fixture({ count: 3 });
  assert.equal((await f.controller.start()).mode, 'binding-required');
  assert.equal(f.storage.getItem(BINDING_KEY), null);
  assert.equal(f.controller.confirmBinding().mode, 'approved');
  assert.equal(JSON.parse(f.storage.getItem(BINDING_KEY)).userId, 'first');
  assert.equal((await f.controller.signOut()).mode, 'signed-out');
  assert.equal(JSON.parse(f.storage.getItem(BINDING_KEY)).userId, 'first');
  assert.equal((await f.controller.signIn('first@example.test', 'test')).mode, 'approved');
  f.setUser('second');
  assert.equal((await f.controller.signIn('second@example.test', 'test')).mode, 'account-mismatch');
  assert.equal(f.controller.getState().canUseLocal, false);
});

test('expired online verification keeps local recording available', async () => {
  const f = fixture();
  assert.equal((await f.controller.start()).mode, 'approved');
  f.advance(SEVEN_DAYS + 1);
  f.setOnline(false);
  const state = await f.controller.start();
  assert.equal(state.mode, 'verification-required');
  assert.equal(state.canUseLocal, true);
  assert.equal(state.cloudVerified, false);
});

test('unapproved user can record locally without cloud verification status', async () => {
  const f = fixture({ approved: false });
  const state = await f.controller.start();
  assert.equal(state.mode, 'pending');
  assert.equal(state.canUseLocal, true);
  assert.equal(state.cloudVerified, true);
  assert.equal(state.profile.approved, false);
});

test('offline first use cannot bind a workspace without a prior sign-in', async () => {
  const f = fixture({ count: 2, connected: false });
  assert.equal((await f.controller.start()).mode, 'signed-out');
  assert.equal(f.storage.getItem(BINDING_KEY), null);
  assert.equal(f.storage.getItem(CACHE_KEY), null);
});

test('failed token renewal never locks a previously bound local workspace', async () => {
  const f = fixture({ count: 1 });
  await f.controller.start();
  f.controller.confirmBinding();
  f.advance(SEVEN_DAYS + 1);
  f.setUserError({ status: 401, message: 'Refresh token expired' });
  const state = await f.controller.verifyOnline();
  assert.equal(state.mode, 'verification-required');
  assert.equal(state.canUseLocal, true);
  assert.equal(state.cloudVerified, false);
});

test('online approval revocation changes the account to pending without deleting local access', async () => {
  const f = fixture();
  assert.equal((await f.controller.start()).mode, 'approved');
  f.setApproved(false);
  const state = await f.controller.verifyOnline();
  assert.equal(state.mode, 'pending');
  assert.equal(state.canUseLocal, true);
  assert.equal(state.profile.approved, false);
});

test('guest mode works offline, persists, and never verifies with Supabase', async () => {
  const f = fixture({ connected: false });
  assert.equal((await f.controller.start()).mode, 'signed-out');
  assert.equal(f.controller.enterGuest().mode, 'guest');
  assert.equal(f.controller.getState().canUseLocal, true);
  assert.equal(f.controller.getState().cloudVerified, false);
  assert.equal(JSON.parse(f.storage.getItem(GUEST_KEY)), true);
  assert.equal((await f.controller.start()).mode, 'guest');
  f.setOnline(true);
  assert.equal((await f.controller.verifyOnline()).mode, 'guest');
  assert.equal(f.getUserCalls(), 0);
  assert.equal(f.storage.getItem(BINDING_KEY), null);
  assert.equal((await f.controller.leaveGuest()).mode, 'signed-out');
  assert.equal(JSON.parse(f.storage.getItem(GUEST_KEY)), false);
});

test('guest mode cannot bind legacy records or cross into an account workspace', async () => {
  const f = fixture({ count: 2 });
  assert.equal((await f.controller.start()).mode, 'binding-required');
  assert.equal(f.controller.enterGuest().mode, 'guest');
  assert.equal(f.storage.getItem(BINDING_KEY), null);
  await assert.rejects(f.controller.signIn('first@example.test', 'test'), /Leave Guest/);
  await f.controller.leaveGuest();
  assert.equal((await f.controller.signIn('first@example.test', 'test')).mode, 'binding-required');
  assert.equal(f.storage.getItem(BINDING_KEY), null);
});

test('guest mode leaves an existing account binding untouched', async () => {
  const f = fixture();
  assert.equal((await f.controller.start()).mode, 'approved');
  const bound = f.storage.getItem(BINDING_KEY);
  assert.equal(f.controller.enterGuest().userId, '');
  assert.equal(f.storage.getItem(BINDING_KEY), bound);
  await f.controller.leaveGuest();
  assert.equal((await f.controller.signIn('first@example.test', 'test')).mode, 'approved');
  assert.equal(f.storage.getItem(BINDING_KEY), bound);
});

test('Inspector sign-out, Guest Mode, Supervisor mismatch, and error-returning sign-out preserve isolation', async () => {
  const f = fixture({ userId: 'inspector' });
  assert.equal((await f.controller.start()).mode, 'approved');
  const binding = f.storage.getItem(BINDING_KEY);
  const inspectorRecord = JSON.stringify([{ id: 'inspector-record', photoId: 'inspector-photo' }]);
  f.storage.setItem('nlex_inspection_entries_v1', inspectorRecord);
  assert.equal((await f.controller.signOut()).mode, 'signed-out');
  assert.equal(f.controller.enterGuest().mode, 'guest');
  f.storage.setItem('nlex_inspection_guest_entries_v1', JSON.stringify([{ id: 'guest-record', guest_claim_required: true }]));
  assert.equal((await f.controller.leaveGuest()).mode, 'signed-out');
  f.setUser('supervisor');
  assert.equal((await f.controller.signIn('supervisor@example.test', 'test')).mode, 'account-mismatch');
  f.storage.setItem(SESSION_KEY, 'supervisor-session');
  f.setSignOutError(new Error('Logout request failed after local session cleanup'));
  assert.equal((await f.controller.signOut()).mode, 'signed-out');
  assert.equal(f.controller.cache().signedIn, false);
  assert.equal((await f.controller.verifyOnline()).mode, 'signed-out');
  assert.equal(f.storage.getItem(SESSION_KEY), null);
  assert.equal(f.storage.getItem(BINDING_KEY), binding);
  assert.equal(f.storage.getItem('nlex_inspection_entries_v1'), inspectorRecord);
  assert.match(f.storage.getItem('nlex_inspection_guest_entries_v1'), /guest-record/);
  f.setSignOutError(null);
  f.setUser('another-account');
  assert.equal((await f.controller.signIn('another@example.test', 'test')).mode, 'account-mismatch');
});

test('a thrown sign-out request clears only the local Supabase session and returns to sign-in', async () => {
  const f = fixture({ userId: 'inspector' });
  assert.equal((await f.controller.start()).mode, 'approved');
  const binding = f.storage.getItem(BINDING_KEY);
  f.setUser('supervisor');
  assert.equal((await f.controller.signIn('supervisor@example.test', 'test')).mode, 'account-mismatch');
  f.storage.setItem(SESSION_KEY, 'supervisor-session');
  f.storage.setItem(SESSION_KEY + '-code-verifier', 'verifier');
  f.setSignOutThrows(true);
  assert.equal((await f.controller.signOut()).mode, 'signed-out');
  assert.equal((await f.controller.start()).mode, 'signed-out');
  assert.equal((await f.controller.verifyOnline()).mode, 'signed-out');
  assert.equal(f.storage.getItem(SESSION_KEY), null);
  assert.equal(f.storage.getItem(SESSION_KEY + '-code-verifier'), null);
  assert.equal(f.storage.getItem(BINDING_KEY), binding);
  f.setSignOutThrows(false);
  f.setUser('inspector');
  assert.equal((await f.controller.signIn('inspector@example.test', 'test')).mode, 'approved');
});

test('signup sends only full name metadata and waits for email confirmation', async () => {
  const f = fixture({ userId: 'new-user' });
  f.storage.setItem(CACHE_KEY, JSON.stringify({ userId: 'old', signedIn: false }));
  assert.equal((await f.controller.start()).mode, 'signed-out');
  const state = await f.controller.register('  New Inspector  ', ' new@example.test ', 'long-password', 'long-password');
  assert.deepEqual(f.signUpRequest(), { email: 'new@example.test', password: 'long-password', options: { data: { full_name: 'New Inspector' } } });
  assert.equal(state.mode, 'registration-pending');
  assert.match(state.message, /Check your email/);
  assert.equal(state.canUseLocal, false);
  assert.equal(f.storage.getItem(BINDING_KEY), null);
  assert.equal((await f.controller.start()).mode, 'registration-pending');
  assert.equal((await f.controller.verifyOnline()).mode, 'registration-pending');
  assert.equal(f.controller.showSignIn().mode, 'signed-out');
});

test('signup rejects a password confirmation mismatch before contacting Supabase', async () => {
  const f = fixture();
  f.storage.setItem(CACHE_KEY, JSON.stringify({ signedIn: false }));
  await f.controller.start();
  await assert.rejects(f.controller.register('Inspector', 'new@example.test', 'one-password', 'other-password'), /Passwords do not match/);
  assert.equal(f.signUpRequest(), null);
});

test('confirmed new user stays pending and local-only until approved profile is reverified', async () => {
  const f = fixture({ userId: 'new-user', approved: false, team: null });
  f.storage.setItem(CACHE_KEY, JSON.stringify({ signedIn: false }));
  await f.controller.start();
  await f.controller.register('New Inspector', 'new@example.test', 'password', 'password');
  f.controller.showSignIn();
  const pending = await f.controller.signIn('new@example.test', 'password');
  assert.equal(pending.mode, 'pending');
  assert.equal(pending.canUseLocal, true);
  assert.equal(pending.profile.approved, false);
  assert.equal(pending.profile.team, null);
  assert.equal(f.storage.getItem(BINDING_KEY) !== null, true);
  f.setApproved(true);
  const approved = await f.controller.verifyOnline();
  assert.equal(approved.mode, 'approved');
  assert.equal(approved.userId, pending.userId);
});
