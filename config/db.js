const useMemory = process.env.NODE_ENV === 'test' || process.env.DB_DRIVER === 'memory';

module.exports = useMemory ? require('./memoryStore') : require('./firestoreStore');
