import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, QrCode, LogOut, CheckCircle2, Plus, Trash2, X, AlertCircle, Code, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Session {
    id: string;
    name: string;
    status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' | 'connecting' | 'disconnected';
    qr?: string;
}

interface DevicesProps {
    socket: any;
}

const Devices: React.FC<DevicesProps> = ({ socket }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [loading, setLoading] = useState(false);
    const [showApiModal, setShowApiModal] = useState(false);
    const [selectedSessionApi, setSelectedSessionApi] = useState<Session | null>(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (!socket) return;

        // Request initial list
        socket.emit('list-sessions');

        // Listeners
        const handleList = (list: any[]) => {
            // Merge with existing state to preserve QR and transient statuses if needed
            setSessions(prev => list.map(s => {
                const existing = prev.find(p => p.id === s.id);
                // IF server says IDLE but we have QR/Connecting locally for this session, keep local (race condition fix)
                // BUT only if we recently interacted? 
                // Actually, let's trust the server list mostly, but preserve QR.

                // Better approach: If server list says IDLE, but we have a QR, it might mean the engine status hasn't synced yet.
                // However, usually Server List is the source of truth.
                // The issue is likely that 'list-sessions' fetches 'IDLE' before 'start-session' updates to 'QR'.

                return { ...s, qr: existing?.qr };
            }));
        };

        const handleUpdate = () => {
            socket.emit('list-sessions');
        };

        const handleSessionStatus = ({ sessionId, status }: any) => {
            // Force update specific session status immediately
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s));
        };

        const handleSessionQr = ({ sessionId, qr }: any) => {
            const cleanQR = qr.replace('data:image/png;base64,', '');
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, qr: cleanQR } : s));
        };

        socket.on('sessions-list', handleList);
        socket.on('sessions-updated', handleUpdate);
        socket.on('session-status', handleSessionStatus);
        socket.on('session-qr', handleSessionQr);

        return () => {
            socket.off('sessions-list', handleList);
            socket.off('sessions-updated', handleUpdate);
            socket.off('session-status', handleSessionStatus);
            socket.off('session-qr', handleSessionQr);
        };
    }, [socket]);

    const handleCreateSession = () => {
        if (!newSessionName.trim() || !socket) return;
        setLoading(true);
        socket.emit('create-session', { name: newSessionName }, (response: any) => {
            setLoading(false);

            if (response && response.error) {
                alert('فشل إضافة الجهاز: ' + response.error);
                return;
            }

            if (response && response.sessionId) {
                setNewSessionName('');
                setShowAddModal(false);
                // Auto-start the session
                handleStartSession(response.sessionId);
            }
        });
    };

    const handleDeleteSession = (sessionId: string) => {
        if (confirm('هل أنت متأكد من حذف هذا الجهاز؟')) {
            socket.emit('delete-session', { sessionId });
        }
    };

    const handleStartSession = (sessionId: string) => {
        socket.emit('start-session', { sessionId });
    };

    const handleLogout = (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        const isConnected = session?.status === 'CONNECTED';
        const message = isConnected
            ? 'هل تريد تسجيل الخروج من هذا الجهاز؟'
            : 'هل تريد إلغاء المحاولة وإعادة تعيين الجلسة؟';

        if (confirm(message)) {
            socket.emit('logout', { sessionId });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">إدارة الأجهزة</h2>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                >
                    <Plus size={18} /> إضافة جهاز جديد
                </button>
            </div>

            {sessions.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                        <Smartphone size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">لا توجد أجهزة متصلة</h3>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">أضف جهازك الأول للبدء في إرسال الحملات.</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-emerald-50 text-emerald-600 font-bold py-3 px-8 rounded-xl hover:bg-emerald-100 transition-all border-2 border-emerald-100"
                    >
                        إضافة جهاز
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sessions.map(session => (
                        <div key={session.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="p-6 flex-1 flex flex-col items-center text-center">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${session.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-600' :
                                    session.status === 'QR' ? 'bg-blue-100 text-blue-600' :
                                        session.status === 'connecting' ? 'bg-amber-100 text-amber-600' :
                                            'bg-slate-100 text-slate-400'
                                    }`}>
                                    {session.status === 'CONNECTED' ? <CheckCircle2 size={32} /> :
                                        session.status === 'QR' ? <QrCode size={32} /> :
                                            <Smartphone size={32} />}
                                </div>

                                <h3 className="font-bold text-lg text-slate-800 mb-1">{session.name}</h3>
                                <p className="text-xs font-mono text-slate-400 mb-6">{session.id}</p>

                                {session.status === 'CONNECTED' ? (
                                    <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 mb-4">
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> متصل
                                    </div>
                                ) : session.status === 'QR' && session.qr ? (
                                    <div className="mb-4 bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                        <QRCodeSVG value={session.qr} size={128} />
                                    </div>
                                ) : session.status === 'connecting' ? (
                                    <div className="text-amber-600 text-sm font-bold animate-pulse mb-4">
                                        جاري الاتصال...
                                    </div>
                                ) : session.status === 'ERROR' ? (
                                    <div className="text-red-500 text-sm font-bold mb-4 flex items-center justify-center gap-1">
                                        <AlertCircle size={16} /> خطأ في الاتصال
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-sm font-bold mb-4">
                                        غير متصل
                                    </div>
                                )}

                                <div className="mt-auto w-full space-y-2">
                                    {!session.status || session.status === 'IDLE' || session.status === 'ERROR' || session.status === 'disconnected' ? (
                                        <button
                                            onClick={() => handleStartSession(session.id)}
                                            className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors"
                                        >
                                            ربط الجهاز
                                        </button>
                                    ) : session.status === 'CONNECTED' ? (
                                        <button
                                            onClick={() => handleLogout(session.id)}
                                            className="w-full py-2 bg-amber-50 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors"
                                        >
                                            تسجيل خروج
                                        </button>
                                    ) : (
                                        // Case: connecting or QR - allow reset
                                        <button
                                            onClick={() => handleLogout(session.id)}
                                            className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw size={16} /> إعادة تعيين الجلسة
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleDeleteSession(session.id)}
                                        className="w-full py-2 text-red-400 hover:text-red-600 text-xs font-bold transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Trash2 size={12} /> حذف من القائمة
                                    </button>

                                    <button
                                        onClick={() => {
                                            setSelectedSessionApi(session);
                                            setShowApiModal(true);
                                        }}
                                        className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors flex items-center justify-center gap-1 border-t border-slate-50 mt-2"
                                    >
                                        <Code size={12} /> الربط البرمجي (API)
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* API Modal */}
            {showApiModal && selectedSessionApi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left" dir="ltr">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200 h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">API Integration</h3>
                            <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 custom-scrollbar pr-4 space-y-6">

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Endpoint URL</label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-sm text-slate-700 break-all">
                                        {window.location.protocol}//{window.location.hostname}:3050/api/sessions/{selectedSessionApi.id}/send
                                    </code>
                                    <button
                                        onClick={() => handleCopy(`${window.location.protocol}//${window.location.hostname}:3050/api/sessions/${selectedSessionApi.id}/send`)}
                                        className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-500 hover:border-emerald-500 transition-colors"
                                    >
                                        {copied ? <Check size={18} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-bold text-slate-700">Payload Examples (JSON)</h4>

                                <div>
                                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">Text Message</span>
                                    <pre className="mt-2 bg-slate-900 text-slate-50 p-4 rounded-xl text-xs font-mono overflow-x-auto">
                                        {`{
  "number": "201012345678",
  "type": "text",
  "content": "Hello via API! Is this working?"
}`}
                                    </pre>
                                </div>

                                <div>
                                    <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-1 rounded">Image Message</span>
                                    <pre className="mt-2 bg-slate-900 text-slate-50 p-4 rounded-xl text-xs font-mono overflow-x-auto">
                                        {`{
  "number": "201012345678", 
  "type": "image",
  "caption": "Check this out!",
  "content": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" 
}`}
                                    </pre>
                                    <p className="text-xs text-slate-400 mt-1">* Content must be a Base64 string (Data URL or raw base64).</p>
                                </div>

                                <div>
                                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">Document (PDF)</span>
                                    <pre className="mt-2 bg-slate-900 text-slate-50 p-4 rounded-xl text-xs font-mono overflow-x-auto">
                                        {`{
  "number": "201012345678",
  "type": "document",
  "caption": "invoice.pdf",
  "content": "BASE64_STRING_HERE..."
}`}
                                    </pre>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* Add Session Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">إضافة جهاز جديد</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">اسم الجهاز</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                                    placeholder="مثال: الفريق التسويقي"
                                    value={newSessionName}
                                    onChange={(e) => setNewSessionName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleCreateSession}
                                disabled={!newSessionName.trim() || loading}
                                className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'جاري الإضافة...' : 'إضافة وبدء الاتصال'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Devices;
