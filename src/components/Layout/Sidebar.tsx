import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Smartphone, Send, Key, LogOut } from 'lucide-react';

interface SidebarProps {
    onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
    const links = [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'لوحة التحكم' },
        { to: '/devices', icon: <Smartphone size={20} />, label: 'الأجهزة المتصلة' },
        { to: '/campaigns', icon: <Send size={20} />, label: 'إرسال الحملات' },
        { to: '/api', icon: <Key size={20} />, label: 'API & Tokens' },
    ];

    return (
        <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed right-0 top-0 border-l border-slate-800">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span className="text-emerald-500">WA</span> Gateway
                </h1>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {links.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                ? 'bg-emerald-500/10 text-emerald-400 font-bold'
                                : 'hover:bg-slate-800 hover:text-white'
                            }`
                        }
                    >
                        {link.icon}
                        <span>{link.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-800">
                <button
                    onClick={onLogout}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-red-400 hover:bg-red-500/10 transition-all font-bold"
                >
                    <LogOut size={20} />
                    <span>تسجيل الخروج</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
