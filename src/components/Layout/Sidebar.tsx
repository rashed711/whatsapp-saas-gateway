import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Smartphone, Send, Key, LogOut, X } from 'lucide-react';

interface SidebarProps {
    onLogout: () => void;
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, isOpen, onClose }) => {
    const links = [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'لوحة التحكم' },
        { to: '/devices', icon: <Smartphone size={20} />, label: 'الأجهزة المتصلة' },
        { to: '/campaigns', icon: <Send size={20} />, label: 'إرسال الحملات' },
    ];

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
                        <span className="text-emerald-500">WA</span> Gateway
                    </h1>
                    {/* Close Button Mobile */}
                    <button
                        onClick={onClose}
                        className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X size={24} />
                    </button>
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
