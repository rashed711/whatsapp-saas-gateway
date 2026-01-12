import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Bot, MessageSquare, Terminal, Smartphone } from 'lucide-react';

interface AutoReplyRule {
    _id: string;
    sessionId?: string;
    keyword: string;
    response: string;
    matchType: 'exact' | 'contains';
    isActive: boolean;
}

interface AutoReplyProps {
    socket: any;
}

const AutoReply: React.FC<AutoReplyProps> = ({ socket }) => {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Sessions State
    const [sessions, setSessions] = useState<any[]>([]);

    // Form State
    const [keyword, setKeyword] = useState('');
    const [response, setResponse] = useState('');
    const [matchType, setMatchType] = useState<'exact' | 'contains'>('exact');
    const [selectedSessionId, setSelectedSessionId] = useState<string>(''); // '' means All

    useEffect(() => {
        fetchRules();

        // Fetch sessions for dropdown
        if (socket && socket.connected) {
            socket.emit('list-sessions');
            socket.on('sessions-list', (data: any[]) => {
                setSessions(data);
            });
        }

        return () => {
            if (socket) socket.off('sessions-list');
        };
    }, [socket]);

    const fetchRules = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/autoreply`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRules(data);
            }
        } catch (error) {
            console.error('Failed to fetch rules', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/autoreply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    keyword,
                    response,
                    matchType,
                    sessionId: selectedSessionId || null
                })
            });

            if (res.ok) {
                setShowModal(false);
                setKeyword('');
                setResponse('');
                setSelectedSessionId('');
                fetchRules();
            }
        } catch (error) {
            console.error('Failed to create rule', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/autoreply/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setRules(rules.filter(r => r._id !== id));
            }
        } catch (error) {
            console.error('Failed to delete rule', error);
        }
    };

    const getSessionName = (id?: string) => {
        if (!id) return 'All Devices';
        const session = sessions.find(s => s.id === id);
        return session ? session.name : 'Unknown Device';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent flex items-center gap-2">
                        <Bot className="w-8 h-8 text-emerald-500" />
                        Auto Reply Bot
                    </h1>
                    <p className="text-gray-400">Configure automatic responses for incoming messages</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition-all shadow-lg shadow-emerald-900/20"
                >
                    <Plus className="w-5 h-5" />
                    New Rule
                </button>
            </div>

            {/* Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rules.map((rule) => (
                    <div key={rule._id} className="bg-gray-800/50 backdrop-blur border border-gray-700/50 p-5 rounded-xl hover:border-emerald-500/30 transition-all group">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-col gap-2">
                                <div className="bg-gray-900/50 px-3 py-1 rounded text-sm text-emerald-400 font-mono flex items-center gap-2 w-fit">
                                    <Terminal className="w-3 h-3" />
                                    {rule.matchType === 'exact' ? 'Exact Match' : 'Contains'}
                                </div>
                                <div className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 w-fit ${rule.sessionId ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                    <Smartphone className="w-3 h-3" />
                                    {getSessionName(rule.sessionId)}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(rule._id)}
                                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="mb-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">When user sends:</div>
                            <div className="font-bold text-white text-lg">"{rule.keyword}"</div>
                        </div>

                        <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-700/30">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                Reply with:
                            </div>
                            <p className="text-gray-300 text-sm whitespace-pre-wrap">{rule.response}</p>
                        </div>
                    </div>
                ))}

                {rules.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-gray-800/20 rounded-xl border border-dashed border-gray-700">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No auto-reply rules configured yet.</p>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Create Auto-Reply Rule</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">For Device</label>
                                <select
                                    value={selectedSessionId}
                                    onChange={(e) => setSelectedSessionId(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                >
                                    <option value="">All Devices (Global Rule)</option>
                                    {sessions.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Keyword</label>
                                <input
                                    type="text"
                                    required
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                    placeholder="e.g. price"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Match Type</label>
                                <div className="flex bg-gray-800 p-1 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('exact')}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${matchType === 'exact' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Exact Match
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('contains')}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${matchType === 'contains' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Contains
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Response Message</label>
                                <textarea
                                    required
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                    rows={4}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none resize-none"
                                    placeholder="Enter the automated reply..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                                >
                                    Create Rule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AutoReply;
