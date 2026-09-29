const mockAuth = {
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => mockAuth,
}));

const firebaseAuth = require('../config/firebaseAuth');

const fbError = (code, message = code) => Object.assign(new Error(message), { code });
const restResponse = (ok, body) => ({ ok, json: async () => body });

beforeEach(() => {
  jest.resetAllMocks();
  process.env.FIREBASE_WEB_API_KEY = 'test-web-key';
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  global.fetch = jest.fn();
});

describe('Admin SDK calls', () => {
  it('createUser returns the new uid', async () => {
    mockAuth.createUser.mockResolvedValue({ uid: 'uid123' });
    await expect(firebaseAuth.createUser({ email: 'a@b.co', password: 'secret12', displayName: 'A' })).resolves.toBe('uid123');
    expect(mockAuth.createUser).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret12', displayName: 'A' });
  });

  it.each([
    ['auth/email-already-exists', 'EMAIL_EXISTS'],
    ['auth/invalid-password', 'WEAK_PASSWORD'],
    ['auth/invalid-email', 'INVALID_EMAIL'],
  ])('maps %s to %s', async (sdkCode, ours) => {
    mockAuth.createUser.mockRejectedValue(fbError(sdkCode));
    await expect(firebaseAuth.createUser({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: ours });
  });

  it('updateUser maps user-not-found', async () => {
    mockAuth.updateUser.mockRejectedValue(fbError('auth/user-not-found'));
    await expect(firebaseAuth.updateUser('nope', { password: 'secret12' })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('deleteUser ignores an account that is already gone but rethrows other errors', async () => {
    mockAuth.deleteUser.mockRejectedValueOnce(fbError('auth/user-not-found'));
    await expect(firebaseAuth.deleteUser('gone')).resolves.toBeUndefined();

    mockAuth.deleteUser.mockRejectedValueOnce(fbError('auth/internal-error'));
    await expect(firebaseAuth.deleteUser('x')).rejects.toMatchObject({ code: 'auth/internal-error' });
  });
});

describe('signIn (Firebase REST: accounts:signInWithPassword)', () => {
  it('posts the credentials with the web API key and returns the uid', async () => {
    global.fetch.mockResolvedValue(restResponse(true, { localId: 'uid123', idToken: 'ignored' }));
    await expect(firebaseAuth.signIn('a@b.co', 'secret12')).resolves.toBe('uid123');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-web-key');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ email: 'a@b.co', password: 'secret12' });
  });

  it.each(['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'INVALID_EMAIL'])(
    'reports %s as generic INVALID_CREDENTIALS',
    async (message) => {
      global.fetch.mockResolvedValue(restResponse(false, { error: { message } }));
      await expect(firebaseAuth.signIn('a@b.co', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
  );

  it('maps throttling and disabled accounts', async () => {
    global.fetch.mockResolvedValueOnce(restResponse(false, { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : ...' } }));
    await expect(firebaseAuth.signIn('a@b.co', 'x')).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });

    global.fetch.mockResolvedValueOnce(restResponse(false, { error: { message: 'USER_DISABLED' } }));
    await expect(firebaseAuth.signIn('a@b.co', 'x')).rejects.toMatchObject({ code: 'USER_DISABLED' });
  });

  it('treats a bad API key / disabled email-password provider as a server error, not a wrong password', async () => {
    global.fetch.mockResolvedValueOnce(restResponse(false, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    await expect(firebaseAuth.signIn('a@b.co', 'x')).rejects.toThrow(/not set up correctly/);

    global.fetch.mockResolvedValueOnce(restResponse(false, { error: { message: 'OPERATION_NOT_ALLOWED' } }));
    await expect(firebaseAuth.signIn('a@b.co', 'x')).rejects.toThrow(/not set up correctly/);
  });

  it('explains clearly when FIREBASE_WEB_API_KEY is missing', async () => {
    delete process.env.FIREBASE_WEB_API_KEY;
    await expect(firebaseAuth.signIn('a@b.co', 'x')).rejects.toThrow(/FIREBASE_WEB_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('talks to the Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set', async () => {
    delete process.env.FIREBASE_WEB_API_KEY;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    global.fetch.mockResolvedValue(restResponse(true, { localId: 'emu1' }));
    await expect(firebaseAuth.signIn('a@b.co', 'x')).resolves.toBe('emu1');
    expect(global.fetch.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/);
  });
});
