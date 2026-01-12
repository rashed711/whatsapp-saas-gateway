import React, { useState } from 'react';
import { Send, Image, FileText, Clock, AlertCircle, CheckCircle2, Bold, Italic, Strikethrough, Code, Smile, X, Hash, Filter, AlertTriangle } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

interface MessageSenderProps {
    socket: any;
    status: string; // Keep for backward compatibility or future use, but passed as empty from Campaigns
}

const MessageSender: React.FC<MessageSenderProps> = ({ socket, status }) => {
    const [numbers, setNumbers] = useState('');
    const [messageType, setMessageType] = useState<'text' | 'image' | 'audio' | 'video' | 'document'>('text');
    const [messageContent, setMessageContent] = useState('');
    const [fileBase64, setFileBase64] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [minDelay, setMinDelay] = useState(3);
    const [maxDelay, setMaxDelay] = useState(10);
    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; status: string } | null>(null);
    const [report, setReport] = useState<{ success: number; failed: number; failedNumbers: { number: string, reason: string }[] }>({ success: 0, failed: 0, failedNumbers: [] });

    const [selectedSessionId, setSelectedSessionId] = useState<string>('');
    const [sessions, setSessions] = useState<{ id: string, name: string, status: string }[]>([]);
    // Debug State
    const [debugLog, setDebugLog] = useState<string[]>([]);

    React.useEffect(() => {
        if (!socket) return;

        const refreshSessions = () => {
            socket.emit('list-sessions');
        };

        refreshSessions();

        const handleList = (list: any[]) => {
            setSessions(list);
            if (!selectedSessionId) {
                const connected = list.find(s => s.status === 'CONNECTED');
                if (connected) setSelectedSessionId(connected.id);
            }
        };

        const handleSessionStatus = ({ sessionId, status }: any) => {
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s));
        };

        socket.on('sessions-list', handleList);
        socket.on('sessions-updated', refreshSessions);
        socket.on('session-status', handleSessionStatus);

        return () => {
            socket.off('sessions-list', handleList);
            socket.off('sessions-updated', refreshSessions);
            socket.off('session-status', handleSessionStatus);
        };
    }, [socket, selectedSessionId]);

    // Independent listener for message progress to avoid dependency cycles
    React.useEffect(() => {
        if (!socket) return;

        const handleProgress = (data: any) => {
            try {
                setDebugLog(prev => [`[Progress ${data.status.toUpperCase()}] ${data.current}/${data.total}`, ...prev].slice(0, 10));

                setProgress({
                    current: data.current || 0,
                    total: data.total || 0,
                    status: data.status || 'unknown'
                });

                if (data.status === 'success') {
                    setReport(prev => ({ ...prev, success: prev.success + 1 }));
                } else if (data.status === 'failed') {
                    setReport(prev => ({
                        ...prev,
                        failed: prev.failed + 1,
                        failedNumbers: [...prev.failedNumbers, { number: data.lastNumber, reason: data.error }]
                    }));
                } else if (data.status === 'stopped') {
                    setSending(false);
                    alert('تم إيقاف الحملة بنجاح');
                }
            } catch (err) {
                console.error('Error in handleProgress:', err);
                setDebugLog(prev => [`[ERROR]: ${(err as Error).message}`, ...prev]);
            }
        };

        const handleComplete = (data: any) => {
            try {
                setDebugLog(prev => [`[Complete] Success: ${data.success}`, ...prev]);
                setSending(false);
                alert(`تم الانتهاء! نجاح: ${data.success}, فشل: ${data.failed}`);
            } catch (err) {
                console.error('Error in handleComplete:', err);
            }
        };

        // Remove any existing listeners first to prevent duplicates
        socket.off('message-progress');
        socket.off('message-complete');

        socket.on('message-progress', handleProgress);
        socket.on('message-complete', handleComplete);

        return () => {
            socket.off('message-progress', handleProgress);
            socket.off('message-complete', handleComplete);
        };
    }, [socket]); // Only re-run if socket object changes

    const handleRemoveDuplicates = () => {
        let list = numbers.split('\n').map(n => n.trim()).filter(n => n.length > 0);
        // 1. Remove exact duplicates
        list = [...new Set(list)];

        // 2. Remove subset/local versions
        const filtered = list.filter((numA, index, self) => {
            // We want to remove numA if there is ANY numB that "covers" it.
            const isRedundant = self.some(numB => {
                if (numA === numB) return false; // Don't compare self

                // Case 1: numA is a suffix of numB (e.g. 50... vs 96650...)
                if (numB.length > numA.length && numB.endsWith(numA)) return true;

                // Case 2: numA starts with 0, and (numA without 0) is suffix of numB
                // e.g. 050... vs 96650...
                if (numA.startsWith('0')) {
                    const withoutZero = numA.substring(1);
                    if (withoutZero.length > 0 && numB.length > withoutZero.length && numB.endsWith(withoutZero)) return true;
                }

                return false;
            });

            return !isRedundant;
        });

        const countRemoved = list.length - filtered.length;
        setNumbers(filtered.join('\n'));
        alert(`تم إزالة التكرار والأرقام الناقصة.\nالمتبقي: ${filtered.length} (تم حذف ${countRemoved} رقم)`);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            const reader = new FileReader();
            reader.onloadend = () => {
                setFileBase64(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const addEmoji = (emojiData: EmojiClickData) => {
        setMessageContent(prev => prev + emojiData.emoji);
    };

    const insertId = () => {
        const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = messageContent;

        const newText = text.substring(0, start) + ' {{id}} ' + text.substring(end);
        setMessageContent(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 8, start + 8);
        }, 0);
    };

    const formatText = (format: 'bold' | 'italic' | 'strike' | 'mono') => {
        const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = messageContent;
        const selectedText = text.substring(start, end);

        let formatted = '';
        switch (format) {
            case 'bold': formatted = `*${selectedText}*`; break;
            case 'italic': formatted = `_${selectedText}_`; break;
            case 'strike': formatted = `~${selectedText}~`; break;
            case 'mono': formatted = `\`\`\`${selectedText}\`\`\``; break;
        }

        const newText = text.substring(0, start) + formatted + text.substring(end);
        setMessageContent(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, end + 1);
        }, 0);
    };

    // Submit handler
    const handleSend = () => {
        if (!selectedSessionId) {
            alert('الرجاء اختيار جهاز للإرسال منه');
            return;
        }

        // Verify session is connected
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session?.status !== 'CONNECTED') {
            alert('الجهاز المحدد غير متصل!');
            return;
        }

        const numbersList = numbers.split('\n').map(n => n.trim()).filter(n => n.length > 5);
        if (numbersList.length === 0) {
            alert('الرجاء إدخال أرقام هواتف صحيحة');
            return;
        }

        if (messageType !== 'text' && !fileBase64) {
            alert('الرجاء اختيار ملف');
            return;
        }

        setSending(true);
        setReport({ success: 0, failed: 0, failedNumbers: [] });
        setProgress({ current: 0, total: numbersList.length, status: 'starting' });

        socket.emit('send-message', {
            sessionId: selectedSessionId,
            numbers: numbersList,
            type: messageType,
            content: messageType === 'text' ? messageContent : fileBase64,
            caption: messageContent,
            minDelay: parseInt(minDelay.toString()),
            maxDelay: parseInt(maxDelay.toString())
        });
    };

    // Derived status for UI
    const selectedSession = sessions.find(s => s.id === selectedSessionId);
    const isConnected = selectedSession?.status === 'CONNECTED';

    // ... useEffect for progress ...

    return (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            {/* ... Header ... */}
            <h3 className="font-bold mb-6 flex items-center gap-2 text-slate-800">
                <Send size={20} className="text-emerald-500" /> إرسال رسائل جماعية
            </h3>

            <div className="space-y-4">
                {/* Session Selector */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">اختر الجهاز المرسل</label>
                    <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-emerald-500 transition-colors"
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                    >
                        <option value="">-- اختر جهاز --</option>
                        {sessions.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.status === 'CONNECTED' ? 'متصل' : 'غير متصل'})
                            </option>
                        ))}
                    </select>
                </div>
                {/* Numbers Input */}
                <div>
                    {/* ... Reuse existing ... */}
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-500">الأرقام (رقم في كل سطر)</label>
                        <button onClick={handleRemoveDuplicates} className="text-xs text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1">
                            <Filter size={12} /> حذف المكرر
                        </button>
                    </div>
                    <textarea
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono h-32 focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="9665xxxxxxxx&#10;9665xxxxxxxx"
                        value={numbers}
                        onChange={(e) => setNumbers(e.target.value)}
                    ></textarea>
                </div>

                {/* ... Message Type & Content ... */}
                {/* Message Type Selector */}
                <div className="flex gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                    {(['text', 'image', 'document', 'video', 'audio'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => { setMessageType(type); setFileBase64(null); }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${messageType === type ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                {/* Unified Content Input Area */}
                <div className="relative">
                    {/* ... Toolbar ... */}
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-500">
                            {messageType === 'text' ? 'نص الرسالة' : 'تسمية توضيحية (Caption)'}
                        </label>
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                            <button onClick={() => formatText('bold')} className="p-1 hover:bg-white rounded text-slate-600" title="Bold">
                                <Bold size={14} />
                            </button>
                            <button onClick={() => formatText('italic')} className="p-1 hover:bg-white rounded text-slate-600" title="Italic">
                                <Italic size={14} />
                            </button>
                            <button onClick={() => formatText('strike')} className="p-1 hover:bg-white rounded text-slate-600" title="Strikethrough">
                                <Strikethrough size={14} />
                            </button>
                            <button onClick={() => formatText('mono')} className="p-1 hover:bg-white rounded text-slate-600" title="Monospace">
                                <Code size={14} />
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                className={`p-1 hover:bg-white rounded ${showEmojiPicker ? 'bg-emerald-100 text-emerald-600' : 'text-slate-600'}`}
                                title="Emoji"
                            >
                                <Smile size={14} />
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={insertId}
                                className="p-1 hover:bg-white rounded text-blue-600 flex items-center gap-1 text-[10px] font-bold"
                                title="Insert Random ID"
                            >
                                <Hash size={12} /> ID
                            </button>
                        </div>
                    </div>

                    {showEmojiPicker && (
                        <div className="absolute top-8 right-0 z-50 shadow-xl">
                            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)}></div>
                            <div className="relative z-50">
                                <EmojiPicker onEmojiClick={addEmoji} width={300} height={400} />
                            </div>
                        </div>
                    )}

                    <textarea
                        id="message-input"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm h-32 focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder={messageType === 'text' ? "اكتب رسالتك هنا..." : "اكتب وصفاً للملف..."}
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                    ></textarea>
                </div>

                {/* File Uploader for Media Types */}
                {messageType !== 'text' && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors relative mt-4">
                        <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                            accept={messageType === 'image' ? 'image/*' : messageType === 'video' ? 'video/*' : messageType === 'audio' ? 'audio/*' : '*/*'}
                        />
                        <div className="mx-auto bg-emerald-50 w-12 h-12 rounded-full flex items-center justify-center text-emerald-500 mb-2">
                            {messageType === 'image' ? <Image size={24} /> : <FileText size={24} />}
                        </div>
                        <p className="text-sm font-bold text-slate-600 truncate px-4">{fileName || 'اضغط لاختيار ملف'}</p>
                        <p className="text-xs text-slate-400 mt-1 uppercase">{messageType} File</p>
                    </div>
                )}

                {/* Connection Status Warning */}
                {(!selectedSessionId || !isConnected) && (
                    <div className="bg-amber-50 text-amber-600 p-3 rounded-lg text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={16} /> {!selectedSessionId ? 'الرجاء اختيار جهاز أولاً' : 'الجهاز المحدد غير متصل'}
                    </div>
                )}

                {/* Footer Actions */}
                <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                        <Clock size={16} className="text-slate-400" />
                        <span className="text-xs text-slate-400 font-bold">عشوائي من</span>
                        <input
                            type="number"
                            className="bg-transparent w-8 text-sm font-bold text-center focus:outline-none border-b border-transparent focus:border-emerald-500"
                            value={minDelay}
                            onChange={(e) => setMinDelay(parseInt(e.target.value))}
                            min="1"
                        />
                        <span className="text-xs text-slate-400 font-bold">إلى</span>
                        <input
                            type="number"
                            className="bg-transparent w-8 text-sm font-bold text-center focus:outline-none border-b border-transparent focus:border-emerald-500"
                            value={maxDelay}
                            onChange={(e) => setMaxDelay(parseInt(e.target.value))}
                            min="1"
                        />
                        <span className="text-xs text-slate-400 font-bold">ثانية</span>
                    </div>

                    {sending ? (
                        <button
                            onClick={() => {
                                if (confirm('هل أنت متأكد من إيقاف الحملة؟')) {
                                    socket.emit('stop-campaign', { sessionId: selectedSessionId });
                                }
                            }}
                            className="flex-1 bg-red-500 text-white font-bold py-3 px-6 rounded-xl hover:bg-red-600 transition-all shadow-lg hover:shadow-red-500/20 flex items-center justify-center gap-2"
                        >
                            إيقاف الحملة <X size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={sending || !isConnected}
                            className="flex-1 bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            إرسال الحملة <Send size={18} />
                        </button>
                    )}
                </div>

                {/* Progress Bar */}
                {sending && progress && (
                    <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>جاري الإرسال: {progress.current} / {progress.total}</span>
                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Report Summary */}
                {/* Report Summary */}
                {(report.success > 0 || report.failed > 0) && (
                    <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                            <AlertTriangle size={16} /> تقرير الإرسال
                        </h4>
                        <div className="flex gap-4 text-xs font-bold">
                            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                <CheckCircle2 size={14} /> ناجح: {report.success}
                            </div>
                            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                                <X size={14} /> فشل: {report.failed}
                            </div>
                        </div>

                        {report.failedNumbers.length > 0 && (
                            <div className="mt-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">الأرقام التي فشل الإرسال لها:</p>
                                <div className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded-lg p-2 space-y-1">
                                    {report.failedNumbers.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs text-red-500">
                                            <span className="font-mono">{item.number}</span>
                                            <span className="opacity-75">{item.reason || 'خطأ غير معروف'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Debug Log */}
                {debugLog.length > 0 && (
                    <div className="mt-4 p-3 bg-black text-green-400 text-xs font-mono rounded-lg overflow-hidden">
                        <p className="font-bold text-white mb-2">System Logs:</p>
                        {debugLog.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageSender;
