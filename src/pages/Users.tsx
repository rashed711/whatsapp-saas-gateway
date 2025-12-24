import React, { useState, useEffect } from 'react';
import { UserPlus, User, Mail, Lock, AlertCircle, Trash2 } from 'lucide-react';

const Users = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create user');
            }

            setSuccess('تم إنشاء المستخدم بنجاح');
            setName('');
            setEmail('');
            setPassword('');
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h2>

            {/* Create User Form */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <UserPlus size={20} className="text-emerald-500" />
                    إضافة مستخدم جديد
                </h3>

                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded-xl mb-4 text-sm font-bold flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
                {success && (
                    <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl mb-4 text-sm font-bold">
                        {success}
                    </div>
                )}

                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">الاسم</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">البريد الإلكتروني</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">كلمة المرور</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                        >
                            {loading ? 'جاري الإضافة...' : 'إضافة المستخدم'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Users List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-700">المستخدمين المسجلين</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 text-slate-500 text-sm">
                            <tr>
                                <th className="p-4">الاسم</th>
                                <th className="p-4">البريد الإلكتروني</th>
                                <th className="p-4">التاريخ</th>
                                <th className="p-4">الصلاحية</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-700">
                            {users.map((user) => (
                                <tr key={user._id} className="border-t border-slate-50 hover:bg-slate-50/50">
                                    <td className="p-4 font-bold flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                            <User size={16} />
                                        </div>
                                        {user.name}
                                    </td>
                                    <td className="p-4">{user.email}</td>
                                    <td className="p-4 text-sm text-slate-500">
                                        {new Date(user.createdAt).toLocaleDateString('ar-EG')}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                                            {user.role === 'admin' ? 'أدمن' : 'مستخدم'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400">لا يوجد مستخدمين</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Users;
