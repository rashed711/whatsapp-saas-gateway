import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Bot, MessageSquare, Terminal, Smartphone, Edit2, Image as ImageIcon, Video, FileText, Mic } from 'lucide-react';

interface AutoReplyRule {
    _id: string;
    sessionId?: string;
    keyword: string;
    response: string;
    matchType: 'exact' | 'contains';
    replyType?: 'text' | 'image' | 'video' | 'audio' | 'document';
    mediaUrl?: string;
    isActive: boolean;
}

interface AutoReplyProps {
    socket: any;
}

const AutoReply: React.FC<AutoReplyProps> = ({ socket }) => {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Sessions State
    const [sessions, setSessions] = useState<any[]>([]);

    // Form State
    const [keyword, setKeyword] = useState('');
    const [response, setResponse] = useState('');
    const [matchType, setMatchType] = useState<'exact' | 'contains'>('contains'); // Default smart match
    const [replyType, setReplyType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
    const [mediaUrl, setMediaUrl] = useState('');
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
            const baseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/autoreply`, {
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

    const handleEdit = (rule: AutoReplyRule) => {
        setEditId(rule._id);
        setKeyword(rule.keyword);
        setResponse(rule.response);
        setMatchType(rule.matchType);
        setSelectedSessionId(rule.sessionId || '');
        setReplyType(rule.replyType || 'text');
        setMediaUrl(rule.mediaUrl || '');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

            const url = editId ? (`${baseUrl}/api/autoreply/${editId}`) : (`${baseUrl}/api/autoreply`);
            const method = editId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    keyword,
                    response,
                    matchType,
                    sessionId: selectedSessionId || undefined,
                    replyType,
                    mediaUrl: replyType !== 'text' ? mediaUrl : undefined
                })
            });

            if (res.ok) {
                closeModal();
                fetchRules();
                // alert(editId ? 'Rule updated successfully!' : 'Rule created successfully!');
            } else {
                const text = await res.text();
                try {
                    const errData = JSON.parse(text);
                    alert(`Error: ${errData.error || 'Failed to save rule'}`);
                } catch (e) {
                    alert(`Server Error: ${text}`);
                }
            }
        } catch (error) {
            alert(`Network Error: ${error}`);
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setEditId(null);
        setKeyword('');
        setResponse('');
        setMediaUrl('');
        setReplyType('text');
        setSelectedSessionId('');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/autoreply/${id}`, {
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
        if (!id) return 'All Devices (Global)';
        const session = sessions.find(s => s.id === id);
        return session ? `${session.name || 'Device'} (${session.phoneNumber || 'No Number'})` : 'Unknown Device';
    };

    const getSessionStatusColor = (id?: string) => {
        if (!id) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
        const session = sessions.find(s => s.id === id);
        return session?.status === 'CONNECTED'
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    };

    const getReplyTypeIcon = (type?: string) => {
        switch (type) {
            case 'image': return <ImageIcon className="w-3 h-3" />;
            case 'video': return <Video className="w-3 h-3" />;
            case 'document': return <FileText className="w-3 h-3" />;
            case 'audio': return <Mic className="w-3 h-3" />;
            default: return <MessageSquare className="w-3 h-3" />;
        }
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
                    onClick={() => { closeModal(); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition-all shadow-lg shadow-emerald-900/20"
                >
                    <Plus className="w-5 h-5" />
                    New Rule
                </button>
            </div>

            {/* Rules Grid - Compact Design */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {rules.map((rule) => (
                    <div key={rule._id} className="bg-gray-800/80 backdrop-blur border border-gray-700/50 rounded-lg p-3 hover:border-emerald-500/40 transition-all group shadow-sm flex flex-col justify-between h-full relative">

                        <div className="flex justify-between items-start mb-2">
                            <div className="flex flex-col gap-1.5 w-full">
                                <div className="flex items-center justify-between w-full">
                                    <h3 className="text-white font-medium truncate flex-1" title={rule.keyword}>
                                        <span className="text-emerald-500 text-sm font-bold mr-1">#</span>
                                        {rule.keyword}
                                    </h3>
                                    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleEdit(rule)}
                                            className="text-gray-400 hover:text-blue-400 p-1 rounded-full hover:bg-blue-500/10 transition-colors"
                                            title="Edit Rule"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(rule._id)}
                                            className="text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-red-500/10 transition-colors"
                                            title="Delete Rule"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    <span className="bg-gray-700/50 text-gray-400 text-[10px] px-1.5 py-0.5 rounded border border-gray-600/30">
                                        {rule.matchType === 'exact' ? 'Exact' : 'Fuzzy'}
                                    </span>
                                    <div className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 max-w-full truncate ${getSessionStatusColor(rule.sessionId)}`}>
                                        <Smartphone className="w-2.5 h-2.5" />
                                        <span className="truncate">{getSessionName(rule.sessionId)}</span>
                                    </div>
                                    <div className="text-[10px] px-1.5 py-0.5 rounded border border-gray-600/30 bg-gray-800 text-gray-300 flex items-center gap-1">
                                        {getReplyTypeIcon(rule.replyType)}
                                        <span className="capitalize">{rule.replyType || 'text'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-400 bg-gray-900/40 p-2 rounded border border-gray-700/20">
                            {rule.mediaUrl && (
                                <div className="mb-1 text-[10px] text-blue-400 truncate opacity-70">
                                    Media: {rule.mediaUrl}
                                </div>
                            )}
                            <div className="line-clamp-2" title={rule.response}>{rule.response}</div>
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

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <h2 className="text-xl font-bold text-white mb-4">{editId ? 'Edit Rule' : 'Create Auto-Reply Rule'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                <label className="block text-sm text-gray-400 mb-1">Keyword(s)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none pl-9"
                                        placeholder="hi, hello, welcome"
                                    />
                                    <Terminal className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Separate multiple keywords with commas.</p>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Match Type</label>
                                <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('exact')}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${matchType === 'exact' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Exact match
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('contains')}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${matchType === 'contains' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Fuzzy / Contains
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {matchType === 'contains' ? 'Allows typos (e.g. "اهلا" matches "اهلاً").' : 'Strict matching only.'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Reply Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['text', 'image', 'video', 'document', 'audio'].map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setReplyType(t as any)}
                                            className={`py-2 px-1 text-xs capitalize rounded-lg border transition-all flex flex-col items-center gap-1 ${replyType === t ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                                        >
                                            {getReplyTypeIcon(t)}
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {replyType !== 'text' && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Media Direct Link (URL)</label>
                                    <input
                                        type="url"
                                        required
                                        value={mediaUrl}
                                        onChange={(e) => setMediaUrl(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                        placeholder={`https://example.com/file.${replyType === 'image' ? 'jpg' : 'mp4'}`}
                                    />
                                    <p className="text-xs text-yellow-500/80 mt-1">Must be a direct, publicly accessible link.</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    {replyType === 'text' ? 'Response Message' : 'Caption (Optional)'}
                                </label>
                                <textarea
                                    required={replyType === 'text'}
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                    rows={replyType === 'text' ? 4 : 2}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none resize-none"
                                    placeholder={replyType === 'text' ? "Enter the automated reply..." : "Add a caption for your media..."}
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    {editId ? 'Save Changes' : 'Create Rule'}
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
