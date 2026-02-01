import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Send, Users, Settings, LogOut, FileText, Smartphone, Bot, X, Calendar } from 'lucide-react';

interface SidebarProps {
    onLogout: () => void;
    isOpen: boolean;
    onClose: () => void;
    systemName: string;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, isOpen, onClose, systemName }) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user.role === 'admin';

    const allLinks: { to: string; icon: React.ReactNode; label: string; permission?: string }[] = [
        { to: '/devices', icon: <Smartphone size={20} />, label: 'الأجهزة المتصلة', permission: 'devices' },
        { to: '/campaigns', icon: <Send size={20} />, label: 'إرسال الحملات', permission: 'campaigns' },
        { to: '/scheduled-campaigns', icon: <Calendar size={20} />, label: 'جدولة الحملات', permission: 'scheduled_campaigns' },
        { to: '/autoreply', icon: <Bot size={20} />, label: 'الرد الآلي', permission: 'autoreply' },
    ];

    const links = allLinks.filter(link => {
        if (isAdmin) return true;
        // Strict Permission Check:
        // If user has 'permissions' array defined (even if empty), we respect it.
        // We only allow "fall-through" if permissions is UNDEFINED (true legacy).
        if (user.permissions === undefined || user.permissions === null) return true;

        return user.permissions.includes(link.permission);
    });

    if (isAdmin) {
        links.push({ to: '/users', icon: <Users size={20} />, label: 'المستخدمين' });
        links.push({ to: '/settings', icon: <Settings size={20} />, label: 'الإعدادات' });
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed top-0 right-0 h-screen w-64 bg-slate-900 text-slate-300 
                flex flex-col border-l border-slate-800 z-50 shadow-2xl
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : 'translate-x-full'} 
                md:translate-x-0 md:shadow-none
            `}>
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        {systemName}
                    </h1>
                    {/* Close Button Mobile */}
                    <button
                        onClick={onClose}
                        className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-800 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                            ${isAdmin ? 'bg-purple-500 text-white' : 'bg-emerald-500 text-white'}`}>
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-white font-medium truncate">{user.name}</p>
                            <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                    {links.map((link) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            onClick={() => onClose()} // Close on navigate on mobile
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
        </>
    );
};

export default Sidebar;
