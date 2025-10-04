const request = require('supertest');

jest.mock('../src/services/auth.service', () => {
  const actual = jest.requireActual('../src/services/auth.service');
  return {
    ...actual,
    validateSessionToken: jest.fn(),
  };
});

const app = require('../src/app');
const authService = require('../src/services/auth.service');
const promptsService = require('../src/services/prompts.service');
const { prisma } = require('../src/lib/prisma');

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  user1: 'token-user-1',
  user2: 'token-user-2',
};

const sessionForUser = (userId, email, role = 'user') => ({
  session: {
    id: `session-${userId}`,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: userId,
      email,
      role,
    },
  },
  renewed: false,
});

const withAuth = (token, req) => req.set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`);

describe('Prompts API', () => {
  beforeEach(() => {
    prisma.__reset();

    authService.validateSessionToken.mockImplementation(async ({ token }) => {
      if (token === TOKENS.user1) {
        return sessionForUser(1, 'user1@example.com');
      }

      if (token === TOKENS.user2) {
        return sessionForUser(2, 'user2@example.com');
      }

      return null;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/prompts', () => {
    it('creates a prompt with automatic position at the end when position is omitted', async () => {
      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/prompts'))
        .send({ title: 'Primeiro', content: 'Conteúdo inicial' })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          title: 'Primeiro',
          content: 'Conteúdo inicial',
          position: 0,
        })
      );
    });

    it('inserts the prompt at the requested position shifting subsequent items', async () => {
      await promptsService.createPrompt({ userId: 1, title: 'A', content: 'Alpha' });
      await promptsService.createPrompt({ userId: 1, title: 'B', content: 'Beta' });

      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/prompts'))
        .send({ title: 'Inserido', content: 'Novo', position: 1 })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.data).toEqual(
        expect.objectContaining({ title: 'Inserido', position: 1 })
      );

      const list = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .expect('Content-Type', /json/)
        .expect(200);

      expect(list.body.data.items.map((item) => [item.title, item.position])).toEqual([
        ['A', 0],
        ['Inserido', 1],
        ['B', 2],
      ]);
    });

    it('rejects invalid payloads', async () => {
      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/prompts'))
        .send({ title: '', content: '' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('allows creating a disabled prompt when enabled=false is provided', async () => {
      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/prompts'))
        .send({ title: 'Temporário', content: 'Somente depois', enabled: false })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.data).toEqual(
        expect.objectContaining({ title: 'Temporário', enabled: false })
      );
    });
  });

  describe('GET /api/v1/prompts', () => {
    it('lists prompts scoped to the authenticated user with pagination metadata', async () => {
      await promptsService.createPrompt({ userId: 1, title: 'Primeiro', content: 'C1' });
      await promptsService.createPrompt({ userId: 1, title: 'Segundo', content: 'C2' });
      await promptsService.createPrompt({ userId: 1, title: 'Terceiro', content: 'C3' });
      await promptsService.createPrompt({ userId: 2, title: 'Outro usuário', content: 'Não listar' });

      const firstPage = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .query({ limit: 2 })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(firstPage.body.data.items).toHaveLength(2);
      expect(firstPage.body.data.items.map((item) => item.title)).toEqual(['Primeiro', 'Segundo']);
      expect(firstPage.body.meta).toEqual(
        expect.objectContaining({ total: 3, limit: 2, offset: 0 })
      );

      const secondPage = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .query({ limit: 2, offset: 2 })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.data.items[0].title).toBe('Terceiro');
      expect(secondPage.body.meta.offset).toBe(2);
    });

    it('filters prompts by enabled state when requested', async () => {
      await promptsService.createPrompt({ userId: 1, title: 'Ativo', content: 'C1' });
      const disabled = await promptsService.createPrompt({ userId: 1, title: 'Inativo', content: 'C2' });

      await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${disabled.id}`))
        .send({ enabled: false })
        .expect(200);

      const enabledOnly = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .query({ enabled: true })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(enabledOnly.body.data.items.every((item) => item.enabled === true)).toBe(true);

      const disabledOnly = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .query({ enabled: false })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(disabledOnly.body.data.items).toHaveLength(1);
      expect(disabledOnly.body.data.items[0]).toEqual(expect.objectContaining({ enabled: false }));
    });
  });

  describe('GET /api/v1/prompts/:id', () => {
    it('returns 404 when the prompt belongs to another user', async () => {
      const otherPrompt = await promptsService.createPrompt({
        userId: 2,
        title: 'Outro',
        content: 'Segredo',
      });

      await withAuth(TOKENS.user1, request(app).get(`/api/v1/prompts/${otherPrompt.id}`))
        .expect('Content-Type', /json/)
        .expect(404);
    });

    it('returns the prompt details when it belongs to the authenticated user', async () => {
      const prompt = await promptsService.createPrompt({
        userId: 1,
        title: 'Detalhe',
        content: 'Ver conteúdo',
      });

      const response = await withAuth(TOKENS.user1, request(app).get(`/api/v1/prompts/${prompt.id}`))
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: prompt.id,
          title: 'Detalhe',
          content: 'Ver conteúdo',
        })
      );
    });
  });

  describe('PATCH /api/v1/prompts/:id', () => {
    it('updates title and content for prompts owned by the user', async () => {
      const prompt = await promptsService.createPrompt({ userId: 1, title: 'Rascunho', content: 'Antigo' });

      const response = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${prompt.id}`))
        .send({ title: 'Atualizado', content: 'Novo' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({ title: 'Atualizado', content: 'Novo' })
      );
    });

    it('rejects empty updates', async () => {
      const prompt = await promptsService.createPrompt({ userId: 1, title: 'Teste', content: 'Conteúdo' });

      const response = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${prompt.id}`))
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('moves the prompt to the end when disabling it', async () => {
      const first = await promptsService.createPrompt({ userId: 1, title: 'Primeiro', content: '1' });
      await promptsService.createPrompt({ userId: 1, title: 'Segundo', content: '2' });

      const response = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${first.id}`))
        .send({ enabled: false })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data).toEqual(expect.objectContaining({ enabled: false }));

      const list = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .expect('Content-Type', /json/)
        .expect(200);

      const lastPrompt = list.body.data.items.at(-1);
      expect(lastPrompt.id).toBe(first.id);
      expect(lastPrompt.enabled).toBe(false);
    });

    it('keeps the position when re-enabling a prompt', async () => {
      const prompt = await promptsService.createPrompt({ userId: 1, title: 'Reativar', content: 'Teste' });

      await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${prompt.id}`))
        .send({ enabled: false })
        .expect(200);

      const reenabled = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${prompt.id}`))
        .send({ enabled: true })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(reenabled.body.data.enabled).toBe(true);

      const list = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .expect('Content-Type', /json/)
        .expect(200);

      const updated = list.body.data.items.find((item) => item.id === prompt.id);
      expect(updated.position).toBe(reenabled.body.data.position);
    });
  });

  describe('DELETE /api/v1/prompts/:id', () => {
    it('removes the prompt and returns 204', async () => {
      const prompt = await promptsService.createPrompt({ userId: 1, title: 'Excluir', content: 'Remover' });

      await withAuth(TOKENS.user1, request(app).delete(`/api/v1/prompts/${prompt.id}`)).expect(204);

      const list = await withAuth(TOKENS.user1, request(app).get('/api/v1/prompts'))
        .expect('Content-Type', /json/)
        .expect(200);

      expect(list.body.data.items).toHaveLength(0);
    });
  });

  describe('PUT /api/v1/prompts/reorder', () => {
    it('reorders prompts atomically and returns the sorted list', async () => {
      const first = await promptsService.createPrompt({ userId: 1, title: 'Primeiro', content: '1' });
      const second = await promptsService.createPrompt({ userId: 1, title: 'Segundo', content: '2' });
      const third = await promptsService.createPrompt({ userId: 1, title: 'Terceiro', content: '3' });

      const response = await withAuth(TOKENS.user1, request(app).put('/api/v1/prompts/reorder'))
        .send({
          items: [
            { id: first.id, position: 2 },
            { id: second.id, position: 0 },
            { id: third.id, position: 1 },
          ],
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.items.map((item) => [item.title, item.position])).toEqual([
        ['Segundo', 0],
        ['Terceiro', 1],
        ['Primeiro', 2],
      ]);
    });

    it('accepts reorder payloads that mix enabled and disabled prompts', async () => {
      const active = await promptsService.createPrompt({ userId: 1, title: 'Ativo', content: '1' });
      const inactive = await promptsService.createPrompt({ userId: 1, title: 'Inativo', content: '2' });

      await withAuth(TOKENS.user1, request(app).patch(`/api/v1/prompts/${inactive.id}`))
        .send({ enabled: false })
        .expect(200);

      const response = await withAuth(TOKENS.user1, request(app).put('/api/v1/prompts/reorder'))
        .send({
          items: [
            { id: inactive.id, position: 5 },
            { id: active.id, position: 3 },
          ],
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: inactive.id, enabled: false, position: 5 }),
          expect.objectContaining({ id: active.id, enabled: true, position: 3 }),
        ])
      );
    });

    it('rejects reordering when an id belongs to another user', async () => {
      const other = await promptsService.createPrompt({ userId: 2, title: 'Outro', content: 'Segredo' });

      const response = await withAuth(TOKENS.user1, request(app).put('/api/v1/prompts/reorder'))
        .send({ items: [{ id: other.id, position: 0 }] })
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body.error.code).toBe('PROMPT_NOT_FOUND');
    });

    it('rejects reordering when duplicate positions are provided', async () => {
      const first = await promptsService.createPrompt({ userId: 1, title: 'Um', content: '1' });
      const second = await promptsService.createPrompt({ userId: 1, title: 'Dois', content: '2' });

      const response = await withAuth(TOKENS.user1, request(app).put('/api/v1/prompts/reorder'))
        .send({
          items: [
            { id: first.id, position: 0 },
            { id: second.id, position: 0 },
          ],
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error.code).toBe('DUPLICATE_POSITION');
    });
  });
});
