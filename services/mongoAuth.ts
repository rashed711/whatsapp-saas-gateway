import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';

export const useMongoDBAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    // RADICAL FIX: In-Memory Cache for zero-latency ratchet updates
    const memoryKeys: { [key: string]: any } = {};

    // Load ALL keys for this session into memory on startup
    console.log(`[Auth] Loading all keys for session ${sessionId} into memory...`);
    const allStoredKeys = await AuthState.find({ sessionId }).lean();
    for (const item of allStoredKeys) {
        memoryKeys[item.key] = JSON.parse(JSON.stringify(item.data), BufferJSON.reviver);
    }
    console.log(`[Auth] Loaded ${allStoredKeys.length} keys for ${sessionId}.`);

    const writeDataBatch = async (updates: { [key: string]: any }) => {
        const operations = Object.entries(updates).map(([key, value]) => {
            if (value) {
                const jsonData = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                return {
                    updateOne: {
                        filter: { sessionId, key },
                        update: { $set: { sessionId, key, data: jsonData } },
                        upsert: true
                    }
                };
            } else {
                return {
                    deleteOne: {
                        filter: { sessionId, key }
                    }
                };
            }
        });

        if (operations.length > 0) {
            // We do NOT await this in the critical path of the ratchet
            AuthState.bulkWrite(operations, { ordered: false }).catch(err => {
                console.error(`[Auth] Async Write-Back failed for ${sessionId}:`, err);
            });
        }
    };

    const creds: AuthenticationCreds = memoryKeys['creds'] || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (memoryKeys[key]) {
                            data[id] = memoryKeys[key];
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const dbUpdates: { [key: string]: any } = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const key = `${type}-${id}`;

                            // 1. Update Memory INSTANTLY (Zero Latency)
                            if (value) {
                                memoryKeys[key] = value;
                            } else {
                                delete memoryKeys[key];
                            }

                            // 2. Queue for DB PERSISTENCE
                            dbUpdates[key] = value;
                        }
                    }
                    // Async persistence
                    writeDataBatch(dbUpdates);
                }
            }
        },
        saveCreds: async () => {
            // Memory is always up-to-date, but we persist to DB
            const jsonData = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
            await AuthState.findOneAndUpdate(
                { sessionId, key: 'creds' },
                { $set: { sessionId, key: 'creds', data: jsonData } },
                { upsert: true }
            );
        }
    };
};
