import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LoginProps {
    onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (username === 'admin' && password === '123456') {
            onLogin();
            navigate('/');
        } else {
            setError('بيانات الدخول غير صحيحة');
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <Lock size={32} />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">تسجيل الدخول</h2>
                <p className="text-center text-slate-500 mb-8">لوحة تحكم واتساب جيتواي</p>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">اسم المستخدم</label>
                        <input
                            type="text"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">كلمة المرور</label>
                        <input
                            type="password"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••"
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}

                    <button
                        type="submit"
                        className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg hover:shadow-emerald-500/20"
                    >
                        دخول
                    </button>
                </form>

                <div className="mt-6 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-400">بيانات افتراضية للتجربة:</p>
                    <p className="text-xs font-mono text-slate-600 mt-1">user: admin | pass: 123456</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
