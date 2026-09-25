/* Phase 10: identity and local workspace access. No inspection/photo transport. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPOTITAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BINDING_KEY = 'kmtrack_auth_workspace_v1';
  const CACHE_KEY = 'kmtrack_auth_identity_v1';
  const GUEST_KEY = 'kmtrack_guest_mode_v1';
  const SESSION_KEY = 'kmtrack_supabase_session_v1';
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  function createController({ client, storage, localCount, onChange, online, now }) {
    const isOnline = online || (() => navigator.onLine !== false);
    const clock = now || Date.now;
    let state = { mode: 'checking', canUseLocal: false, cloudVerified: false, userId: '', email: '', profile: null, verifiedAt: 0 };
    let candidate = null;
    let generation = 0;
    let guestSignout = Promise.resolve();
    const read = key => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; } };
    const write = (key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
    const binding = () => read(BINDING_KEY);
    const cache = () => read(CACHE_KEY);
    const guestEnabled = () => read(GUEST_KEY) === true;
    const emit = next => { state = Object.freeze(next); if (onChange) onChange(state); return state; };
    const signedOut = message => emit({ mode: 'signed-out', canUseLocal: false, cloudVerified: false, userId: '', email: '', profile: null, verifiedAt: 0, message: message || 'Sign in or continue without signing in.' });
    const guest = () => emit({ mode: 'guest', canUseLocal: true, cloudVerified: false, userId: '', email: '', profile: null, verifiedAt: 0, message: 'Guest / Local Mode. Inspections and photos stay on this device. Sign in later to review and claim them before any future sync.' });

    function enterGuest() {
      ++generation;
      if (!write(GUEST_KEY, true)) return emit({ mode: 'storage-error', canUseLocal: false, cloudVerified: false, userId: '', email: '', profile: null, verifiedAt: 0, message: 'Local storage is unavailable. Guest records cannot be saved safely.' });
      const saved = cache();
      if (saved) write(CACHE_KEY, { ...saved, signedIn: false });
      candidate = null;
      // Local sign-out clears an existing SDK session; guest recording never waits
      // for the network and no inspection/photo transport is configured.
      guestSignout = Promise.resolve().then(() => client.auth.signOut({ scope: 'local' })).catch(() => {});
      return guest();
    }

    async function leaveGuest() {
      if (state.mode !== 'guest') return state;
      await guestSignout;
      if (!write(GUEST_KEY, false)) return emit({ ...state, mode: 'storage-error', canUseLocal: false, message: 'Could not leave Guest / Local Mode safely.' });
      return signedOut('Guest records remain on this device. Sign in to open your account workspace.');
    }

    function present(identity, verified) {
      candidate = identity;
      const bound = binding();
      const base = { userId: identity.userId, email: identity.email || '', profile: identity.profile || null, verifiedAt: identity.verifiedAt || 0, cloudVerified: !!verified, canUseLocal: false };
      if (bound?.userId && bound.userId !== identity.userId) return emit({ ...base, mode: 'account-mismatch', message: 'This device workspace belongs to another account. Its records remain hidden.' });
      if (!bound?.userId) {
        if (localCount() > 0) return emit({ ...base, mode: 'binding-required', legacyCount: localCount(), message: 'Confirm ownership before opening existing local inspections.' });
        if (!write(BINDING_KEY, { userId: identity.userId, boundAt: clock() })) return emit({ ...base, mode: 'storage-error', message: 'Local storage is unavailable. Workspace access cannot be secured.' });
      }
      const approved = identity.profile?.approved === true;
      const recent = identity.verifiedAt && clock() - identity.verifiedAt <= SEVEN_DAYS;
      let mode = 'local-only';
      let message = 'Online verification is required before cloud functions resume.';
      if (verified && approved) { mode = 'approved'; message = 'Approved account. Inspections remain saved locally; cloud sync is not connected yet.'; }
      else if (verified && !approved) { mode = 'pending'; message = 'Approval pending. Local inspections and photos are available; cloud and team data are unavailable.'; }
      else if (approved && recent && !isOnline()) { mode = 'offline-recent'; message = 'Offline. Local recording and previously imported records are available; live cloud and team data are unavailable.'; }
      else if (approved && !recent) { mode = 'verification-required'; message = 'Online verification is overdue. Keep recording locally; cloud and team data are unavailable.'; }
      return emit({ ...base, mode, message, canUseLocal: true });
    }

    function restoreLocal(message) {
      const saved = cache();
      if (!saved?.signedIn || !saved.userId) return signedOut('Sign in or continue without signing in. First sign-in requires an internet connection.');
      const restored = { userId: saved.userId, email: saved.email, profile: saved.profile, verifiedAt: saved.verifiedAt };
      return present(restored, false);
    }

    async function verifyOnline() {
      if (guestEnabled()) return state.mode === 'guest' ? state : guest();
      if (state.mode === 'registration-pending') return state;
      // A failed SDK sign-out may still retain an in-memory user. Explicit
      // device sign-out remains authoritative until the next password sign-in.
      if (cache()?.signedIn === false) return state.mode === 'signed-out' ? state : signedOut();
      const run = ++generation;
      if (!isOnline()) return restoreLocal();
      let userResult;
      try { userResult = await client.auth.getUser(); }
      catch (_) { if (run === generation) return restoreLocal('Could not reach authentication. Local recording remains available.'); return state; }
      if (run !== generation) return state;
      if (userResult.error || !userResult.data?.user) {
        // An expired or unreachable session must not lock field recording.
        // Only an explicit sign-out removes local access to the bound account.
        return restoreLocal('Sign in online to renew verification. Local recording remains available.');
      }
      const user = userResult.data.user;
      let profileResult;
      try { profileResult = await client.from('profiles').select('id,full_name,role,approved,team').eq('id', user.id).single(); }
      catch (_) { if (run === generation) return restoreLocal('Profile verification is unavailable. Local recording remains available.'); return state; }
      if (run !== generation) return state;
      if (profileResult.error || !profileResult.data || profileResult.data.id !== user.id) {
        const previous = cache();
        if (previous?.userId === user.id) return present({ userId: user.id, email: user.email || previous.email, profile: previous.profile, verifiedAt: previous.verifiedAt }, false);
        return present({ userId: user.id, email: user.email || '', profile: null, verifiedAt: 0 }, false);
      }
      const identity = { userId: user.id, email: user.email || '', profile: profileResult.data, verifiedAt: clock() };
      write(CACHE_KEY, { ...identity, signedIn: true });
      return present(identity, true);
    }

    async function start() {
      if (state.mode === 'registration-pending') return state;
      if (guestEnabled()) {
        if (state.mode !== 'guest') guestSignout = Promise.resolve().then(() => client.auth.signOut({ scope: 'local' })).catch(() => {});
        return state.mode === 'guest' ? state : guest();
      }
      const saved = cache();
      if (saved && saved.signedIn === false) return signedOut();
      if (!isOnline()) return restoreLocal();
      return verifyOnline();
    }

    async function signIn(email, password) {
      if (guestEnabled()) throw new Error('Leave Guest / Local Mode before signing in. Guest records will remain separate.');
      if (!isOnline()) throw new Error('First sign-in and account changes require internet.');
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      // Do not retain the password; the SDK owns its session storage.
      const user = result.data?.user;
      if (user) write(CACHE_KEY, { userId: user.id, email: user.email || email, profile: null, verifiedAt: 0, signedIn: true });
      return verifyOnline();
    }

    async function register(fullName, email, password, confirmation) {
      if (guestEnabled()) throw new Error('Leave Guest / Local Mode before creating an account. Guest records will remain separate.');
      if (state.mode !== 'signed-out') throw new Error('Sign out before creating another account.');
      if (!isOnline()) throw new Error('Creating an account requires an internet connection.');
      const name = String(fullName || '').trim();
      const address = String(email || '').trim();
      if (!name || name.length > 120) throw new Error('Enter a full name of 120 characters or fewer.');
      if (!address) throw new Error('Enter an email address.');
      if (!password) throw new Error('Enter a password.');
      if (password !== confirmation) throw new Error('Passwords do not match.');
      // User metadata is identity information only. The backend trigger owns
      // profile creation and must keep role, team and approval server-controlled.
      const result = await client.auth.signUp({ email: address, password, options: { data: { full_name: name } } });
      if (result?.error) throw result.error;
      if (result?.data?.session) await signOut(); // Never auto-open or bind a workspace at registration.
      return emit({ mode: 'registration-pending', canUseLocal: false, cloudVerified: false, userId: '', email: address, profile: null, verifiedAt: 0,
        message: result?.data?.session
          ? 'Account created. Sign in to continue. Your account remains local-only until an administrator approves it.'
          : 'Check your email to confirm your account. After confirmation, sign in to continue. Your account will remain local-only until an administrator approves it.' });
    }

    function showSignIn() {
      if (state.mode === 'registration-pending') return signedOut();
      return state;
    }

    async function signOut() {
      ++generation;
      const saved = cache();
      // Mark the identity signed out before the SDK emits SIGNED_OUT. Its event
      // handler calls start(), which must not restore a mismatched account.
      if (saved && !write(CACHE_KEY, { ...saved, signedIn: false })) throw new Error('Could not save the signed-out state on this device.');
      candidate = null;
      let signOutError = null;
      try {
        const result = await client.auth.signOut({ scope: 'local' });
        signOutError = result?.error || null;
      } catch (error) { signOutError = error; }
      // A failed sign-out request can leave the browser session behind. Remove
      // only this client's auth tokens; never touch workspace, record or photo data.
      try {
        storage.removeItem(SESSION_KEY);
        storage.removeItem(SESSION_KEY + '-code-verifier');
      } catch (_) { throw new Error('Could not clear the local authentication session.'); }
      ++generation;
      return signedOut(signOutError
        ? 'Signed out on this device. The online sign-out request could not be completed. Local inspections and photos remain saved.'
        : 'Signed out. Local inspections and photos remain on this device. You can continue in Guest / Local Mode.');
    }

    function confirmBinding() {
      if (state.mode !== 'binding-required' || !candidate?.userId) return state;
      if (!write(BINDING_KEY, { userId: candidate.userId, boundAt: clock() })) return emit({ ...state, mode: 'storage-error', message: 'Could not save workspace ownership. No records were assigned.' });
      return present(candidate, state.cloudVerified);
    }

    return { start, signIn, register, showSignIn, signOut, verifyOnline, enterGuest, leaveGuest, confirmBinding, getState: () => state, binding, cache };
  }

  return { createController, BINDING_KEY, CACHE_KEY, GUEST_KEY, SESSION_KEY, SEVEN_DAYS };
});
