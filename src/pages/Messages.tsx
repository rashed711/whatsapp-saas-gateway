import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Smartphone, Search, Users } from 'lucide-react';

interface Session {
    id: string;
    name: string;
    status: string;
}

interface Contact {
    id: string; // WhatsApp JID
    name?: string; // Saved Name
    notify?: string; // Push Name
    verifiedName?: string;
}

const ContactList: React.FC = () => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSession, setSelectedSession] = useState<string>('');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchSessions();
    }, []);

    useEffect(() => {
        if (selectedSession) {
            fetchContacts(selectedSession);
        } else {
            setContacts([]);
        }
    }, [selectedSession]);

    const fetchSessions = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3050'}/api/sessions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                setSessions(data.filter(s => s.status === 'CONNECTED'));
                if (data.length > 0 && !selectedSession) {
                    const connected = data.find(s => s.status === 'CONNECTED');
                    if (connected) setSelectedSession(connected.id);
                }
            }
        } catch (error) {
            console.error('Failed to fetch sessions', error);
        }
    };

    const fetchContacts = async (sessionId: string) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3050'}/api/sessions/${sessionId}/contacts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                setContacts(data);
            }
        } catch (error) {
            console.error('Failed to fetch contacts', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        const filteredContacts = getFilteredContacts();

        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
        csvContent += "Phone Number,Saved Name,Push Name\n";

        filteredContacts.forEach(contact => {
            const phone = contact.id.replace('@s.whatsapp.net', '');
            const name = (contact.name || '').replace(/"/g, '""');
            const pushName = (contact.notify || '').replace(/"/g, '""');

            csvContent += `"${phone}","${name}","${pushName}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `contacts_${selectedSession}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getFilteredContacts = () => {
        return contacts.filter(c => {
            const phone = c.id.replace('@s.whatsapp.net', '');
            const searchLower = searchTerm.toLowerCase();
            return phone.includes(searchTerm) ||
                (c.name && c.name.toLowerCase().includes(searchLower)) ||
                (c.notify && c.notify.toLowerCase().includes(searchLower));
        });
    };

    const displayContacts = getFilteredContacts();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">قائمة العملاء (Contacts)</h1>
                    <p className="text-slate-500">استخراج وتصدير أرقام العملاء الذين تواصلوا معك</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => selectedSession && fetchContacts(selectedSession)}
                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        <span>تحديث</span>
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={contacts.length === 0}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={18} />
                        <span>تصدير Excel</span>
                    </button>
                </div>
            </div>

            {/* Session Selector */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <Smartphone className="text-slate-400" />
                <select
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-slate-700 font-medium"
                >
                    <option value="" disabled>اختر الجهاز...</option>
                    {sessions.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                </select>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <Search className="text-slate-400" />
                <input
                    type="text"
                    placeholder="بحث برقم الهاتف أو الاسم..."
                    className="flex-1 bg-transparent outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Contacts Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 text-slate-600 font-medium text-sm">
                            <tr>
                                <th className="p-4">رقم الهاتف</th>
                                <th className="p-4">الاسم المسجل (Saved Name)</th>
                                <th className="p-4">اسم العميل (WhatsApp Name)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayContacts.length > 0 ? (
                                displayContacts.map((contact) => (
                                    <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-800" dir="ltr">
                                            {contact.id.replace('@s.whatsapp.net', '')}
                                        </td>
                                        <td className="p-4 text-slate-700">
                                            {contact.name || '-'}
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            {contact.notify || '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-slate-400">
                                        {selectedSession ? 'لا يوجد جهات اتصال لعرضها' : 'الرجاء اختيار جهاز'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="text-center text-sm text-slate-400 mt-4">
                إجمالي الأرقام: {contacts.length}
            </div>
        </div>
    );
};

export default ContactList;
