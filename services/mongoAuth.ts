import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';

export const useMongoDBAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    const memoryKeys: { [key: string]: any } = {};

    // 1. Initial Load: Populate cache for speed
    console.log(`[Auth] Initializing memory cache for session ${sessionId}...`);
    const allStoredKeys = await AuthState.find({ sessionId }).lean();
    for (const item of allStoredKeys) {
        memoryKeys[item.key] = JSON.parse(JSON.stringify(item.data), BufferJSON.reviver);
    }
    console.log(`[Auth] Cache ready (${allStoredKeys.length} keys).`);

    let writeMutex = Promise.resolve();

    const writeToDB = async (updates: { [key: string]: any }) => {
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
            // CRITICAL (v19): Strictly enforce atomic/sequential writes using a promise queue
            writeMutex = writeMutex.then(async () => {
                try {
                    await AuthState.bulkWrite(operations, { ordered: false });
                } catch (err) {
                    console.error(`[Auth] Failed to bulkWrite keys for session ${sessionId}:`, err);
                }
            });
            await writeMutex;
        }
    };

    const creds: AuthenticationCreds = memoryKeys['creds'] || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    const missingKeys: string[] = [];

                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (memoryKeys[key]) {
                            data[id] = memoryKeys[key];
                        } else {
                            missingKeys.push(id);
                        }
                    }

                    // READ-THROUGH: If anything is missing in memory, check DB
                    if (missingKeys.length > 0) {
                        const dbKeys = missingKeys.map(id => `${type}-${id}`);
                        const dbResults = await AuthState.find({ sessionId, key: { $in: dbKeys } }).lean();
                        for (const res of dbResults) {
                            const val = JSON.parse(JSON.stringify(res.data), BufferJSON.reviver);
                            const id = res.key.split(`${type}-`)[1];
                            data[id] = val;
                            memoryKeys[res.key] = val; // Cache it
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

                            // Update Memory
                            if (value) {
                                memoryKeys[key] = value;
                            } else {
                                delete memoryKeys[key];
                            }

                            // Prepare DB Update
                            dbUpdates[key] = value;
                        }
                    }
                    // CRITICAL: Await before returning to engine
                    await writeToDB(dbUpdates);
                }
            }
        },
        saveCreds: async () => {
            memoryKeys['creds'] = creds; // Sync memory explicitly
            const jsonData = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
            await AuthState.findOneAndUpdate(
                { sessionId, key: 'creds' },
                { $set: { sessionId, key: 'creds', data: jsonData } },
                { upsert: true }
            );
        }
    };
};
