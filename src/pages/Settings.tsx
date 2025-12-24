import React, { useState } from 'react';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';

const Settings = () => {
    const [formData, setFormData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError('كلمة المرور الجديدة غير متطابقة');
            return;
        }

        if (formData.newPassword.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }

        setLoading(true);

        try {
            let API_URL = import.meta.env.VITE_API_URL || '';
            if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);

            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    oldPassword: formData.oldPassword,
                    newPassword: formData.newPassword
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'فشل تغيير كلمة المرور');
            }

            setSuccess('تم تغيير كلمة المرور بنجاح');
            setFormData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إعدادات الحساب</h2>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center gap-2">
                    <Lock size={20} className="text-emerald-500" />
                    تغيير كلمة المرور
                </h3>

                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded-xl mb-6 text-sm font-bold flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
                {success && (
                    <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl mb-6 text-sm font-bold flex items-center gap-2">
                        <CheckCircle size={16} /> {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">كلمة المرور الحالية</label>
                        <input
                            type="password"
                            value={formData.oldPassword}
                            onChange={(e) => setFormData({ ...formData, oldPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">كلمة المرور الجديدة</label>
                        <input
                            type="password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">تأكيد كلمة المرور الجديدة</label>
                        <input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                        >
                            {loading ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Settings;
