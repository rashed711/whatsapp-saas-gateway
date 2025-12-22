import React, { useState } from 'react';
import { Send, Image, FileText, Clock, AlertCircle, CheckCircle2, Bold, Italic, Strikethrough, Code, Smile, X, Hash, Filter, AlertTriangle } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

interface MessageSenderProps {
    socket: any;
    status: string;
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

    const handleRemoveDuplicates = () => {
        const list = numbers.split('\n').map(n => n.trim()).filter(n => n.length > 0);
        const unique = [...new Set(list)];
        setNumbers(unique.join('\n'));
        alert(`تم إزالة التكرار. المتبقي: ${unique.length} من أصل ${list.length}`);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            // Optional: Default caption to filename if empty? 
            // setMessageContent(prev => prev || file.name); 
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

        // Restore focus (optional, but good for UX)
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, end + 1); // approximate cursor placement
        }, 0);
    };

    const handleSend = () => {
        if (status !== 'connected') {
            alert('يجب ربط الجهاز أولاً');
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
            numbers: numbersList,
            type: messageType,
            content: messageType === 'text' ? messageContent : fileBase64,
            caption: messageContent, // Use messageContent as caption for media
            minDelay: parseInt(minDelay.toString()),
            maxDelay: parseInt(maxDelay.toString())
        });
    };

    // Listen for progress updates (would typically be in useEffect here or parent)
    React.useEffect(() => {
        if (!socket) return;

        socket.on('message-progress', (data: any) => {
            setProgress({
                current: data.current,
                total: data.total,
                status: data.status
            });

            if (data.status === 'success') {
                setReport(prev => ({ ...prev, success: prev.success + 1 }));
            } else if (data.status === 'failed') {
                setReport(prev => ({
                    ...prev,
                    failed: prev.failed + 1,
                    failedNumbers: [...prev.failedNumbers, { number: data.lastNumber, reason: data.error }]
                }));
            }
        });

        socket.on('message-complete', () => {
            setSending(false);
            alert('تم الانتهاء من الإرسال!');
        });

        return () => {
            socket.off('message-progress');
            socket.off('message-complete');
        };
    }, [socket]);

    return (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold mb-6 flex items-center gap-2 text-slate-800">
                <Send size={20} className="text-emerald-500" /> إرسال رسائل جماعية
            </h3>

            <div className="space-y-4">
                {/* Numbers Input */}
                <div>
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
                {status !== 'connected' && (
                    <div className="bg-amber-50 text-amber-600 p-3 rounded-lg text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={16} /> يجب ربط الجهاز قبل الإرسال
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

                    <button
                        onClick={handleSend}
                        disabled={sending || status !== 'connected'}
                        className="flex-1 bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {sending ? 'جاري الإرسال...' : 'إرسال الحملة'} <Send size={18} />
                    </button>
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

            </div>
        </div>
    );
};

export default MessageSender;
