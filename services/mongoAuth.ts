
import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { AuthState } from '../models/index.js';

export const useMongoDBAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    // Helper to read data (handling BufferJSON parsing if needed)
    const readData = async (key: string) => {
        const result = await AuthState.findOne({ sessionId, key });
        if (!result) return null;
        return JSON.parse(JSON.stringify(result.data), BufferJSON.reviver);
    };

    // Helper to write data
    const writeData = async (key: string, data: any) => {
        const jsonData = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        await AuthState.findOneAndUpdate(
            { sessionId, key },
            { sessionId, key, data: jsonData },
            { upsert: true, new: true }
        );
    };

    // Helper to delete data
    const removeData = async (key: string) => {
        await AuthState.deleteOne({ sessionId, key });
    };

    // Load credentials
    const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(ids.map(async id => {
                        const value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            data[id] = value; // Proto object
                        } else if (value) {
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const key = `${type}-${id}`;
                            if (value) {
                                tasks.push(writeData(key, value));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        }
    };
};
