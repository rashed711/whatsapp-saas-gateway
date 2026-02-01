import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Pause, Play, Trash2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

const getApiUrl = () => {
    let url = import.meta.env.VITE_API_URL || 'http://localhost:3050';
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
};

const ScheduledCampaigns = () => {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Create Form State
    const [formData, setFormData] = useState({
        title: '',
        sessionId: '',
        messageType: 'text',
        content: '',
        caption: '',
        recipientsText: '', // Raw input
        scheduledTime: '',
        minDelay: 3,
        maxDelay: 10
    });

    const [sessions, setSessions] = useState<any[]>([]);

    useEffect(() => {
        fetchCampaigns();
        fetchSessions();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const token = localStorage.getItem('token');
            const API_URL = getApiUrl();

            const res = await fetch(`${API_URL}/api/scheduled-campaigns`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setCampaigns(data);
        } catch (error) {
            console.error('Failed to fetch campaigns', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSessions = async () => {
        // We might need to fetch sessions via API or reuse existing context if available
        // For now, let's fetch via API (we added /api/sessions endpoint earlier)
        try {
            const token = localStorage.getItem('token');
            const API_URL = getApiUrl();

            const res = await fetch(`${API_URL}/api/sessions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            // Filter only connected sessions usually, but maybe offline ones can be scheduled for whenever they come online?
            // Let's allow all, but scheduler checks connectivity.
            setSessions(data);
        } catch (error) {
            console.error('Failed to fetch sessions', error);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const API_URL = getApiUrl();

            // Parse numbers
            const numbers = formData.recipientsText.split(/[\n,]+/).map(n => n.trim()).filter(n => n.length >= 10);
            const recipients = numbers.map(n => ({ number: n }));

            const payload = {
                ...formData,
                recipients,
                scheduledTime: new Date(formData.scheduledTime).toISOString()
            };

            const res = await fetch(`${API_URL}/api/scheduled-campaigns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to create campaign');
            }

            setShowCreateModal(false);
            fetchCampaigns();
            setFormData({
                title: '',
                sessionId: '',
                messageType: 'text',
                content: '',
                caption: '',
                recipientsText: '',
                scheduledTime: '',
                minDelay: 3,
                maxDelay: 10
            });
        } catch (error: any) {
            alert(error.message);
        }
    };

    const handleAction = async (id: string, action: 'pause' | 'resume' | 'delete') => {
        try {
            const token = localStorage.getItem('token');
            const API_URL = getApiUrl();

            if (action === 'delete') {
                await fetch(`${API_URL}/api/scheduled-campaigns/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } else {
                const status = action === 'pause' ? 'paused' : 'active';
                await fetch(`${API_URL}/api/scheduled-campaigns/${id}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status })
                });
            }
            fetchCampaigns();
        } catch (error) {
            console.error(error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-700';
            case 'active': return 'bg-blue-100 text-blue-700';
            case 'completed': return 'bg-emerald-100 text-emerald-700';
            case 'paused': return 'bg-orange-100 text-orange-700';
            case 'failed': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">الحملات المجدولة</h2>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-all"
                >
                    <Plus size={20} />
                    جدولة حملة جديدة
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">جاري التحميل...</div>
            ) : campaigns.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">لا توجد حملات مجدولة حالياً</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {campaigns.map(camp => (
                        <div key={camp._id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-bold text-slate-800">{camp.title}</h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(camp.status)}`}>
                                        {camp.status === 'pending' ? 'مجدول' :
                                            camp.status === 'active' ? 'جاري الإرسال' :
                                                camp.status === 'completed' ? 'مكتمل' :
                                                    camp.status === 'paused' ? 'متوقف مؤقتاً' : camp.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Clock size={16} />
                                        {new Date(camp.scheduledTime).toLocaleString('ar-EG')}
                                    </span>
                                    <span>•</span>
                                    <span>{camp.recipients.length} مستلم</span>
                                </div>
                                {/* Progress Bar */}
                                {(camp.status === 'active' || camp.status === 'completed' || camp.status === 'paused') && (
                                    <div className="w-full max-w-xs space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>تم الإرسال: {camp.progress?.sent || 0}</span>
                                            <span>فشل: {camp.progress?.failed || 0}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all duration-500"
                                                style={{ width: `${((camp.progress?.sent || 0) / (camp.recipients.length || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {camp.status === 'active' && (
                                    <button
                                        onClick={() => handleAction(camp._id, 'pause')}
                                        className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg tooltip" title="إيقاف مؤقت"
                                    >
                                        <Pause size={20} />
                                    </button>
                                )}
                                {(camp.status === 'paused' || camp.status === 'pending') && (
                                    <button
                                        onClick={() => handleAction(camp._id, 'resume')}
                                        className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg tooltip" title={camp.status === 'pending' ? 'بدء الآن' : 'استئناف'}
                                    >
                                        <Play size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (confirm('هل أنت متأكد من حذف هذه الحملة؟')) handleAction(camp._id, 'delete');
                                    }}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="حذف"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-bold text-slate-800">جدولة حملة جديدة</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-red-500">
                                <Trash2 size={24} className="rotate-45" /> {/* Using Trash as X implies cancel, wait, use X from lucide? No import, Trash2 rotate is hacky. Let's assume user accepts it or import X if possible. Actually I imported X not in this file. Wait, I see Plus, Pause, etc. I'll stick to a simple text X or existing icon. Ah, in prior steps I imported X in Sidebar. */}
                                <span className="text-2xl font-bold">&times;</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">اسم الحملة</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full border p-2 rounded-lg focus:border-emerald-500 outline-none"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="مثال: عرض الجمعة"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">الجهاز المرسل</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded-lg focus:border-emerald-500 outline-none"
                                        value={formData.sessionId}
                                        onChange={e => setFormData({ ...formData, sessionId: e.target.value })}
                                    >
                                        <option value="">اختر الجهاز...</option>
                                        {sessions.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">توقيت الإرسال</label>
                                <input
                                    type="datetime-local"
                                    required
                                    className="w-full border p-2 rounded-lg focus:border-emerald-500 outline-none ltr"
                                    value={formData.scheduledTime}
                                    onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                                />
                                <p className="text-xs text-slate-400 mt-1">سيتم بدء الحملة تلقائياً في هذا التوقيت</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">أقل فاصل (ثواني)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full border p-2 rounded-lg"
                                        value={formData.minDelay}
                                        onChange={e => setFormData({ ...formData, minDelay: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">أقصى فاصل (ثواني)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full border p-2 rounded-lg"
                                        value={formData.maxDelay}
                                        onChange={e => setFormData({ ...formData, maxDelay: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الرسالة</label>
                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="msgType"
                                            checked={formData.messageType === 'text'}
                                            onChange={() => setFormData({ ...formData, messageType: 'text' })}
                                            className="accent-emerald-500"
                                        />
                                        <span>نص فقط</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="msgType"
                                            checked={formData.messageType === 'image'}
                                            onChange={() => setFormData({ ...formData, messageType: 'image' })}
                                            className="accent-emerald-500"
                                        />
                                        <span>صورة</span>
                                    </label>
                                    {/* Add other types if needed */}
                                </div>

                                {formData.messageType !== 'text' && (
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">رابط الوسائط (URL)</label>
                                        <input
                                            type="url"
                                            className="w-full border p-2 rounded-lg text-left"
                                            value={formData.content}
                                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                                            placeholder="https://example.com/image.jpg"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        {formData.messageType === 'text' ? 'نص الرسالة' : 'الشرح (Caption)'}
                                    </label>
                                    <textarea
                                        className="w-full border p-2 rounded-lg h-24 focus:border-emerald-500 outline-none"
                                        value={formData.messageType === 'text' ? formData.content : formData.caption}
                                        onChange={e => formData.messageType === 'text'
                                            ? setFormData({ ...formData, content: e.target.value })
                                            : setFormData({ ...formData, caption: e.target.value })
                                        }
                                        placeholder="اكتب رسالتك هنا..."
                                    ></textarea>
                                    <p className="text-xs text-slate-400 mt-1">يمكنك استخدام {'{{id}}'} لإدراج رقم عشوائي لمنع الحظر.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">أرقام المستلمين</label>
                                <textarea
                                    required
                                    className="w-full border p-2 rounded-lg h-32 focus:border-emerald-500 outline-none font-mono text-sm"
                                    value={formData.recipientsText}
                                    onChange={e => setFormData({ ...formData, recipientsText: e.target.value })}
                                    placeholder={`201000000001\n201000000002\n...`}
                                ></textarea>
                                <p className="text-xs text-slate-400 mt-1">ضع كل رقم في سطر جديد. الأرقام يجب أن تكون بالصيغة الدولية (مثال: 201xxxxxxxxx).</p>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all"
                                >
                                    حفظ وجدولة
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduledCampaigns;
