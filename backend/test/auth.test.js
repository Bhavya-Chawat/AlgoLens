const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const config = require('../config');
const auth = require('../services/auth');
const store = require('../services/store');
const { createApp } = require('../server');

// node --test runs with ALGOLENS database in memory (see config.db.file), so nothing here touches real data.

function request(port, { method = 'GET', path, cookie = '', body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:3000', 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const set = (res.headers['set-cookie'] || []).find((c) => c.startsWith('algolens_session='));
        resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, cookie: set ? set.split(';')[0] : '', setCookie: set || '' });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

test('passwords are salted scrypt hashes and verify only the right password', async () => {
  const a = await auth.hashPassword('correct horse battery');
  const b = await auth.hashPassword('correct horse battery');
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.equal(await auth.verifyPassword('correct horse battery', a), true);
  assert.equal(await auth.verifyPassword('correct horse batter', a), false);
  assert.equal(await auth.verifyPassword('x', 'not-a-hash'), false);
});

test('credentials are validated with a message a person can act on', () => {
  assert.match(auth.validateCredentials({ username: 'ab', password: 'longenough1' }), /username/i);
  assert.match(auth.validateCredentials({ username: 'bad name!', password: 'longenough1' }), /username/i);
  assert.match(auth.validateCredentials({ username: 'bhavya', password: 'short' }), /at least 8/);
  assert.equal(auth.validateCredentials({ username: 'bhavya_1', password: 'longenough1' }), null);
});

test('accounts, sessions and saved data over HTTP', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  t.after(() => server.close());

  await t.test('signed out: me is null and saved data needs an account', async () => {
    assert.equal((await request(port, { path: '/api/auth/me' })).body.user, null);
    const res = await request(port, { path: '/api/me/solutions' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'auth_required');
  });

  let alice = '';
  let aliceId = 0;
  await t.test('register signs you in with an HttpOnly cookie; sharing is off by default', async () => {
    const res = await request(port, { method: 'POST', path: '/api/auth/register', body: { username: 'Alice', password: 'wonderland-1' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, 'Alice');
    assert.equal(res.body.user.shareStats, false);
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Lax/);
    assert.ok(!('password_hash' in res.body.user));
    alice = res.cookie;
    aliceId = res.body.user.id;
    assert.equal((await request(port, { path: '/api/auth/me', cookie: alice })).body.user.username, 'Alice');
  });

  await t.test('usernames are unique ignoring case; the password never comes back', async () => {
    const res = await request(port, { method: 'POST', path: '/api/auth/register', body: { username: 'alice', password: 'another-pass-1' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'username_taken');
  });

  await t.test('a wrong password and an unknown user get the same answer', async () => {
    const wrong = await request(port, { method: 'POST', path: '/api/auth/login', body: { username: 'Alice', password: 'not-her-password' } });
    const none = await request(port, { method: 'POST', path: '/api/auth/login', body: { username: 'nobody', password: 'not-her-password' } });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, none.body);
  });

  await t.test('saving a run stores the code once per distinct code', async () => {
    const run = { language: 'python', code: 'def f(x):\n    return x', problemKey: 'two-sum', title: 'Two Sum', steps: 12 };
    const first = await request(port, { method: 'POST', path: '/api/me/runs', cookie: alice, body: run });
    const second = await request(port, { method: 'POST', path: '/api/me/runs', cookie: alice, body: run });
    assert.equal(first.status, 201);
    assert.equal(first.body.solutionId, second.body.solutionId);
    assert.notEqual(first.body.runId, second.body.runId);
    const list = await request(port, { path: '/api/me/solutions', cookie: alice });
    assert.equal(list.body.solutions.length, 1);
    assert.equal(list.body.solutions[0].runs, 2);
    const full = await request(port, { path: `/api/me/solutions/${first.body.solutionId}`, cookie: alice });
    assert.equal(full.body.solution.code, run.code);
  });

  await t.test('bad input is refused, not stored', async () => {
    const res = await request(port, { method: 'POST', path: '/api/me/runs', cookie: alice, body: { language: 'brainfuck', code: '+', steps: 1 } });
    assert.equal(res.status, 400);
  });

  await t.test('approaches: yours always, other people only when two or more agreed to share', async () => {
    const run = (code, problemKey = 'two-sum') => ({ language: 'python', code, problemKey, steps: 5 });
    const a = await request(port, { method: 'POST', path: '/api/me/runs', cookie: alice, body: run('a = 1') });
    store.setRunAlgorithm(aliceId, a.body.runId, 'Hash map');

    let res = await request(port, { path: '/api/me/problems/two-sum/approaches', cookie: alice });
    assert.deepEqual(res.body.mine, [{ algorithm: 'Hash map', count: 1 }]);
    assert.deepEqual(res.body.others, [], 'one person is never enough to show others');

    const bobReg = await request(port, { method: 'POST', path: '/api/auth/register', body: { username: 'bob_1', password: 'builder-pass-1', shareStats: true } });
    const bob = bobReg.cookie;
    await request(port, { method: 'PATCH', path: '/api/auth/me', cookie: alice, body: { shareStats: true } });
    const b = await request(port, { method: 'POST', path: '/api/me/runs', cookie: bob, body: run('b = 2') });
    store.setRunAlgorithm(bobReg.body.user.id, b.body.runId, 'Two pointers');

    res = await request(port, { path: '/api/me/problems/two-sum/approaches', cookie: alice });
    assert.equal(res.body.people, 2);
    assert.deepEqual(res.body.others.map((o) => o.algorithm).sort(), ['Hash map', 'Two pointers']);
    assert.ok(res.body.others.every((o) => o.count === 1));
    assert.ok(!JSON.stringify(res.body).includes('a = 1'), 'no code is ever shared');
  });

  await t.test('logout ends the session', async () => {
    const out = await request(port, { method: 'POST', path: '/api/auth/logout', cookie: alice, body: {} });
    assert.equal(out.status, 200);
    assert.equal((await request(port, { path: '/api/auth/me', cookie: alice })).body.user, null);
  });

  await t.test('deleting an account needs the password and removes the data', async () => {
    const login = await request(port, { method: 'POST', path: '/api/auth/login', body: { username: 'bob_1', password: 'builder-pass-1' } });
    const cookie = login.cookie;
    assert.equal((await request(port, { method: 'DELETE', path: '/api/auth/me', cookie, body: { password: 'nope-nope-nope' } })).status, 401);
    assert.equal((await request(port, { method: 'DELETE', path: '/api/auth/me', cookie, body: { password: 'builder-pass-1' } })).status, 200);
    assert.equal((await request(port, { path: '/api/auth/me', cookie })).body.user, null);
    const gone = await request(port, { method: 'POST', path: '/api/auth/login', body: { username: 'bob_1', password: 'builder-pass-1' } });
    assert.equal(gone.status, 401);
  });

  await t.test('with ALGOLENS_REQUIRE_LOGIN everything but sign-in needs an account', async () => {
    config.auth.requireLogin = true;
    t.after(() => { config.auth.requireLogin = false; });
    assert.equal((await request(port, { path: '/api/health' })).status, 200);
    assert.equal((await request(port, { path: '/api/auth/config' })).body.requireLogin, true);
    const res = await request(port, { method: 'POST', path: '/api/hint', body: { messages: [{ role: 'user', content: 'x' }] } });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'auth_required');
    config.auth.requireLogin = false;
  });
});
