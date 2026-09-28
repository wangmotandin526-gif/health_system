jest.mock('firebase-admin', () => {
  const store = new Map();
  let counter = 0;
  const key = (col, id) => `${col}/${id}`;

  const snapshot = (col, id) => ({
    id,
    exists: store.has(key(col, id)),
    data: () => ({ ...store.get(key(col, id)) }),
  });

  const docRef = (col, id) => ({
    id,
    set: async (v) => void store.set(key(col, id), { ...v }),
    create: async (v) => {
      if (store.has(key(col, id))) {
        const e = new Error('6 ALREADY_EXISTS: Document already exists');
        e.code = 6;
        throw e;
      }
      store.set(key(col, id), { ...v });
    },
    get: async () => snapshot(col, id),
    update: async (patch) => {
      if (!store.has(key(col, id))) {
        const e = new Error('5 NOT_FOUND');
        e.code = 5;
        throw e;
      }
      store.set(key(col, id), { ...store.get(key(col, id)), ...patch });
    },
    delete: async () => void store.delete(key(col, id)),
  });

  const query = (col, filters = []) => ({
    where: (field, op, value) => query(col, [...filters, [field, op, value]]),
    get: async () => ({
      docs: [...store.keys()]
        .filter((k) => k.startsWith(`${col}/`))
        .map((k) => k.slice(col.length + 1))
        .filter((id) => filters.every(([f, , v]) => store.get(key(col, id))[f] === v))
        .map((id) => snapshot(col, id)),
    }),
  });

  const firestore = {
    settings: jest.fn(),
    collection: (col) => ({
      doc: (id) => docRef(col, id || `auto${++counter}`),
      where: (...args) => query(col).where(...args),
      get: () => query(col).get(),
    }),
    getAll: async (...refs) => {
      // The real SDK rejects a call with no document refs.
      if (refs.length === 0) throw new Error('getAll needs at least one document');
      return Promise.all(refs.map((r) => r.get()));
    },
  };

  const apps = [];
  return {
    apps,
    initializeApp: jest.fn(() => apps.push({ delete: async () => {} })),
    credential: { cert: jest.fn((c) => c) },
    firestore: () => firestore,
  };
});

const store = require('../config/firestoreStore');

describe('firestoreStore adapter', () => {
  it('creates documents with an id and created_at, and reads them back', async () => {
    const id = await store.create('things', { name: 'a' });
    const doc = await store.get('things', id);
    expect(doc).toMatchObject({ id, name: 'a' });
    expect(typeof doc.created_at).toBe('string');
  });

  it('returns null for missing or empty ids', async () => {
    expect(await store.get('things', 'nope')).toBeNull();
    expect(await store.get('things', '')).toBeNull();
    expect(await store.get('things', undefined)).toBeNull();
  });

  it('createWithId succeeds once, then reports ALREADY_EXISTS', async () => {
    await store.createWithId('locks', 'slot1', { x: 1 });
    await expect(store.createWithId('locks', 'slot1')).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });

  it('getMany skips missing ids, de-duplicates, and copes with an empty list', async () => {
    const a = await store.create('things', { n: 1 });
    const b = await store.create('things', { n: 2 });
    const found = await store.getMany('things', [a, b, a, 'missing', null, undefined]);
    expect(Object.keys(found).sort()).toEqual([a, b].sort());
    expect(await store.getMany('things', [])).toEqual({});
  });

  it('find applies equality filters', async () => {
    await store.create('people', { role: 'admin', name: 'x' });
    await store.create('people', { role: 'patient', name: 'y' });
    await store.create('people', { role: 'patient', name: 'z' });
    expect((await store.find('people', { role: 'patient' })).map((p) => p.name).sort()).toEqual(['y', 'z']);
    expect((await store.find('people', { role: 'patient', name: 'z' })).length).toBe(1);
    expect((await store.find('people')).length).toBe(3);
  });

  it('update merges fields and remove deletes', async () => {
    const id = await store.create('things', { a: 1, b: 2 });
    await store.update('things', id, { b: 3 });
    expect(await store.get('things', id)).toMatchObject({ a: 1, b: 3 });
    await store.remove('things', id);
    expect(await store.get('things', id)).toBeNull();
  });
});
