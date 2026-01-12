import React, { useEffect, useState } from 'react';
import { MessageSquare, Smartphone, Activity, ArrowUpRight } from 'lucide-react';

interface DashboardProps {
    socket: any;
}

const Dashboard: React.FC<DashboardProps> = ({ socket }) => {
    const [stats, setStats] = useState({
        messagesToday: 0,
        activeDevices: 0,
        uptime: '100%'
    });

    // In a real app, we'd fetch these from an API or listen to socket events
    // For now, let's mock/simulate some data or ask backend for /stats
    useEffect(() => {
        const fetchStats = () => {
            fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3050'}/stats`)
                .then(res => res.json())
                .then(data => setStats(data))
                .catch(err => console.error('Failed to fetch stats:', err));
        };

        fetchStats();

        const interval = setInterval(() => {
            // Refresh stats every 30s
            fetchStats();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const cards = [
        { label: 'الرسائل اليومية', value: stats.messagesToday.toLocaleString(), icon: <MessageSquare size={24} />, color: 'text-blue-500', bg: 'bg-blue-50' },
        { label: 'الأجهزة النشطة', value: `${stats.activeDevices} / 5`, icon: <Smartphone size={24} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { label: 'وقت التشغيل', value: stats.uptime, icon: <Activity size={24} />, color: 'text-amber-500', bg: 'bg-amber-50' },
    ];

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">لوحة الاحصائيات</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 font-bold text-sm mb-1">{card.label}</p>
                            <h3 className="text-3xl font-black text-slate-800">{card.value}</h3>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg} ${card.color}`}>
                            {card.icon}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="max-w-md mx-auto">
                    <h3 className="text-xl font-bold text-slate-800 mb-2">مرحباً بك في لوحة التحكم</h3>
                    <p className="text-slate-500 mb-6">يمكنك إدارة أجهزتك، إرسال الحملات، ومتابعة التقارير من خلال القائمة الجانبية.</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
