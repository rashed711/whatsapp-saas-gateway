import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';

export const useMongoDBAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    // Optimized read (multiple keys at once)
    const readDataBatch = async (keys: string[]) => {
        const results = await AuthState.find({ sessionId, key: { $in: keys } }).lean();
        const data: { [key: string]: any } = {};
        for (const res of results) {
            // Un-stringifying if stored as JSON, or direct data if Mixed
            data[res.key] = JSON.parse(JSON.stringify(res.data), BufferJSON.reviver);
        }
        return data;
    };

    // Optimized write (multiple keys at once via bulkWrite)
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
            await AuthState.bulkWrite(operations, { ordered: false });
        }
    };

    // Load initial credentials
    const results = await readDataBatch(['creds']);
    const creds: AuthenticationCreds = results['creds'] || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const keys = ids.map(id => `${type}-${id}`);
                    const results = await readDataBatch(keys);
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};

                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (results[key]) {
                            data[id] = results[key];
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const updates: { [key: string]: any } = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            updates[`${type}-${id}`] = value;
                        }
                    }
                    await writeDataBatch(updates);
                }
            }
        },
        saveCreds: async () => {
            const jsonData = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
            await AuthState.findOneAndUpdate(
                { sessionId, key: 'creds' },
                { $set: { data: jsonData } },
                { upsert: true }
            );
        }
    };
};
