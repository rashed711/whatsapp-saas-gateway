import React, { useState, useEffect } from 'react';
import { UserPlus, User, Lock, AlertCircle, Trash2, Edit2, Ban, CheckCircle, X, Shield } from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
    { id: 'devices', label: 'الأجهزة المتصلة' },
    { id: 'campaigns', label: 'إرسال الحملات' },
    { id: 'scheduled_campaigns', label: 'جدولة الحملات' },
    { id: 'autoreply', label: 'الرد الآلي' },
];

const Users = () => {
    const [users, setUsers] = useState<any[]>([]);

    // Create Form State
    const [createForm, setCreateForm] = useState({ name: '', username: '', password: '', permissions: [] as string[] });

    // Edit Form State
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({ name: '', username: '', password: '', isActive: true, permissions: [] as string[] });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const getApiUrl = () => {
        let url = import.meta.env.VITE_API_URL || 'http://localhost:3050';
        if (url.endsWith('/')) url = url.slice(0, -1);
        return url;
    };

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${getApiUrl()}/api/users`, {
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
        setError(''); setSuccess(''); setLoading(true);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(createForm),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create user');

            setSuccess('تم إنشاء المستخدم بنجاح');
            setCreateForm({ name: '', username: '', password: '', permissions: [] });
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (user: any) => {
        setEditingUser(user);
        setEditForm({
            name: user.name,
            username: user.username,
            password: '',
            isActive: user.isActive,
            permissions: user.permissions || []
        });
        setError(''); setSuccess('');
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${editingUser._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(editForm),
            });

            if (!response.ok) throw new Error('Failed to update user');

            setSuccess('تم تحديث بيانات المستخدم');
            setEditingUser(null);
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}" نهائياً؟`)) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to delete');
            fetchUsers();
            setSuccess(`تم حذف المستخدم ${name}`);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const toggleSuspend = async (user: any) => {
        const action = user.isActive ? 'إيقاف' : 'تفعيل';
        if (!window.confirm(`هل تريد ${action} حساب "${user.name}"؟`)) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${user._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ...user, isActive: !user.isActive }),
            });

            if (!response.ok) throw new Error('Failed to update status');
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h2>

            {/* Notifications */}
            {error && <div className="bg-red-50 text-red-500 p-3 rounded-xl flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
            {success && <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl flex items-center gap-2"><CheckCircle size={16} /> {success}</div>}

            {/* Create User Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <UserPlus size={20} className="text-emerald-500" />
                    إضافة مستخدم جديد
                </h3>
                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="text" placeholder="الاسم" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className="bg-slate-50 border p-3 rounded-xl" required />
                    <input type="text" placeholder="اسم المستخدم" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} className="bg-slate-50 border p-3 rounded-xl" required />
                    <input type="password" placeholder="كلمة المرور" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="bg-slate-50 border p-3 rounded-xl" required />
                    <div className="md:col-span-3 border-t border-slate-100 pt-3 mt-1">
                        <label className="block text-sm font-medium text-slate-500 mb-2">الصلاحيات المصرح بها:</label>
                        <div className="flex gap-4 flex-wrap">
                            {AVAILABLE_PERMISSIONS.map(perm => (
                                <label key={perm.id} className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-emerald-500"
                                        checked={createForm.permissions.includes(perm.id)}
                                        onChange={(e) => {
                                            const newPerms = e.target.checked
                                                ? [...createForm.permissions, perm.id]
                                                : createForm.permissions.filter(p => p !== perm.id);
                                            setCreateForm({ ...createForm, permissions: newPerms });
                                        }}
                                    />
                                    <span className="text-sm">{perm.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-3 flex justify-end">
                        <button type="submit" disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50">
                            {loading ? 'جاري الإضافة...' : 'إضافة المستخدم'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Users List Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 text-slate-500 text-sm">
                            <tr>
                                <th className="p-4">الاسم</th>
                                <th className="p-4">اسم المستخدم</th>
                                <th className="p-4">الحالة</th>
                                <th className="p-4">الصلاحية</th>
                                <th className="p-4">إجراءات</th>
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
                                    <td className="p-4">{user.username}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                            {user.isActive ? 'نشط' : 'موقوف'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                                            {user.role === 'admin' ? 'أدمن' : 'مستخدم'}
                                        </span>
                                    </td>
                                    <td className="p-4 flex gap-2">
                                        <button onClick={() => handleEditClick(user)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل">
                                            <Edit2 size={18} />
                                        </button>
                                        <button onClick={() => toggleSuspend(user)} className={`p-2 rounded-lg ${user.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`} title={user.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}>
                                            {user.isActive ? <Ban size={18} /> : <CheckCircle size={18} />}
                                        </button>
                                        <button onClick={() => handleDeleteUser(user._id, user.name)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف">
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا يوجد مستخدمين</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">تعديل المستخدم</h3>
                            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600"><X /></button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1">الاسم</label>
                                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border p-2 rounded-lg" required />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">اسم المستخدم</label>
                                <input type="text" value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className="w-full border p-2 rounded-lg" required />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">كلمة المرور الجديدة (اختياري)</label>
                                <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} className="w-full border p-2 rounded-lg" placeholder="اتركها فارغة للإبقاء على القديمة" />
                            </div>
                            <div className="space-y-2 mt-4">
                                <label className="block text-sm font-medium text-slate-700">الصلاحيات</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-100">
                                    {AVAILABLE_PERMISSIONS.map(perm => (
                                        <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-emerald-500"
                                                checked={editForm.permissions.includes(perm.id)}
                                                onChange={(e) => {
                                                    const newPerms = e.target.checked
                                                        ? [...editForm.permissions, perm.id]
                                                        : editForm.permissions.filter(p => p !== perm.id);
                                                    setEditForm({ ...editForm, permissions: newPerms });
                                                }}
                                            />
                                            <span className="text-sm">{perm.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-4">
                                <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} className="w-5 h-5 accent-emerald-500" />
                                <label>حساب نشط</label>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button type="submit" className="flex-1 bg-emerald-500 text-white py-2 rounded-lg font-bold hover:bg-emerald-600">حفظ التغييرات</button>
                                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;
