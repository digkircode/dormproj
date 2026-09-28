const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SessionService } = require('../dist/src/auth/session.service.js');

test('logout revokes only its own session', async () => {
  const rows = new Map();
  const jwt = {
    signAsync: async (claims, options) => JSON.stringify({ ...claims, jti: options.jwtid }),
    verifyAsync: async (token) => JSON.parse(token),
  };
  const prisma = {
    userSession: {
      deleteMany: async () => {},
      create: async ({ data }) => rows.set(data.id, { ...data, revokedAt: null }),
      findUnique: async ({ where }) => rows.get(where.id) ?? null,
      updateMany: async ({ where, data }) => {
        const row = rows.get(where.id);
        if (row?.userId === where.userId) row.revokedAt = data.revokedAt;
      },
    },
  };
  const sessions = new SessionService(jwt, prisma);
  const user = { id: 17, email: 'resident@example.test', roles: ['RESIDENT'] };
  const first = await sessions.sign(user);
  const second = await sessions.sign(user);
  assert.deepEqual(await sessions.verify(first), user);
  await sessions.revoke(first);
  await assert.rejects(sessions.verify(first), /Сессия завершена/);
  assert.deepEqual(await sessions.verify(second), user);
  await assert.rejects(sessions.verify(JSON.stringify(user)), /Сессия не найдена/);
});
