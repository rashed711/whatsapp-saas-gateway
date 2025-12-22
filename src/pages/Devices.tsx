import React from 'react';
import { Smartphone, RefreshCw, QrCode, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface DevicesProps {
    socket: any;
    status: string;
    qrCode: string | null;
    onStartSession: () => void;
    onLogout: () => void;
}

const Devices: React.FC<DevicesProps> = ({ socket, status, qrCode, onStartSession, onLogout }) => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">الأجهزة المتصلة</h2>
                {status === 'connected' && (
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                    >
                        <LogOut size={16} /> فصل الاتصال
                    </button>
                )}
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
                {status === 'idle' || status === 'disconnected' ? (
                    <div className="py-12">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                            <Smartphone size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">لا يوجد جهاز متصل</h3>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto">قم بربط حساب واتساب الخاص بك للبدء في إرسال الحملات.</p>
                        <button
                            onClick={onStartSession}
                            className="bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2 mx-auto"
                        >
                            <QrCode size={20} /> ربط جهاز جديد
                        </button>
                    </div>
                ) : status === 'qr' && qrCode ? (
                    <div className="py-8">
                        <p className="font-bold text-slate-600 mb-6">امسح الرمز بواسطة تطبيق واتساب</p>
                        <div className="bg-white p-4 rounded-2xl shadow-lg inline-block border border-slate-100">
                            <QRCodeSVG value={qrCode} size={256} />
                        </div>
                        <div className="mt-8 flex justify-center">
                            <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-bold animate-pulse">
                                <RefreshCw size={14} className="animate-spin" /> جاري انتظار المسح...
                            </div>
                        </div>
                    </div>
                ) : status === 'connected' ? (
                    <div className="py-12">
                        <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
                            <CheckCircle2 size={48} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">متصل بنجاح</h3>
                        <p className="text-slate-500 font-mono dir-ltr">Session Active</p>
                    </div>
                ) : (
                    <div className="py-12">
                        <div className="flex items-center justify-center gap-2 text-slate-400">
                            <RefreshCw size={24} className="animate-spin" />
                            <span className="font-bold">جاري التحميل...</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Devices;
