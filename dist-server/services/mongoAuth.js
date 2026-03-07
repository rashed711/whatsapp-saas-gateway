import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';
export const useMongoDBAuthState = async (sessionId) => {
    const memoryKeys = {};
    // 1. Initial Load: Populate cache for speed
    console.log(`[Auth] Initializing memory cache for session ${sessionId}...`);
    const allStoredKeys = await AuthState.find({ sessionId }).lean();
    for (const item of allStoredKeys) {
        memoryKeys[item.key] = JSON.parse(JSON.stringify(item.data), BufferJSON.reviver);
    }
    console.log(`[Auth] Cache ready (${allStoredKeys.length} keys).`);
    const writeToDB = async (updates) => {
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
            }
            else {
                return {
                    deleteOne: {
                        filter: { sessionId, key }
                    }
                };
            }
        });
        if (operations.length > 0) {
            // CRITICAL: We MUST await this to prevent "Stale State Load" on restart
            await AuthState.bulkWrite(operations, { ordered: false });
        }
    };
    const creds = memoryKeys['creds'] || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    const missingKeys = [];
                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (memoryKeys[key]) {
                            data[id] = memoryKeys[key];
                        }
                        else {
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
                    const dbUpdates = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const key = `${type}-${id}`;
                            // Update Memory
                            if (value) {
                                memoryKeys[key] = value;
                            }
                            else {
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
            await AuthState.findOneAndUpdate({ sessionId, key: 'creds' }, { $set: { sessionId, key: 'creds', data: jsonData } }, { upsert: true });
        }
    };
};
