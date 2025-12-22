import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  LayoutDashboard, Key, QrCode as QrIcon, LogOut, CheckCircle2,
  Send, Zap, Clock, Smartphone, RefreshCcw, Copy, AlertTriangle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import MessageSender from './src/components/MessageSender';

const App = () => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('sk_live_wsaas_987a6s5d4f3g2h1j');
  const [copied, setCopied] = useState(false);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    setLogs(prev => [`[${timestamp}] ${prefix} ${message}`, ...prev].slice(0, 100));
  };

  // Initialize Socket.io reference
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Connect to backend
    socketRef.current = io('http://localhost:3050');

    socketRef.current.on('connect', () => {
      addLog('تم الاتصال بالسيرفر الخلفي.', 'success');
    });

    socketRef.current.on('connect_error', (err: any) => {
      console.error('Socket connection error:', err);
      // addLog(`فشل الاتصال بالسيرفر: ${err.message}`, 'error'); 
    });

    socketRef.current.on('status', (newStatus: any) => {
      setStatus(newStatus);
      if (newStatus === 'connected') {
        addLog('تم ربط الجهاز وتخزين الجلسة سحابياً.', 'success');
      } else if (newStatus === 'error') {
        addLog('فشل في بدء الجلسة. يرجى المحاولة مرة أخرى.', 'error');
      }
    });

    socketRef.current.on('qr', (qrData: string) => {
      // Clean up the string just in case, though Baileys sends raw string usually
      const cleanQR = qrData.replace('data:image/png;base64,', '');
      setQrCode(cleanQR);
      addLog('تم استلام رمز QR جديد.', 'info');
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const handleStartConnection = () => {
    if (socketRef.current) {
      socketRef.current.emit('start-session');
      addLog('جاري طلب جلسة جديدة من السيرفر...');
    }
  };

  const handleLogout = () => {
    if (confirm('هل أنت متأكد أنك تريد تسجيل الخروج وحذف الجلسة؟')) {
      if (socketRef.current) {
        socketRef.current.emit('logout');
        addLog('جاري تسجيل الخروج...');
      }
    }
  };

  const handleDisconnect = () => {
    setStatus('disconnected');
    setQrCode(null);
    addLog('تم قطع الاتصال بناءً على طلب المستخدم.');
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderConnectionStatus = () => {
    switch (status) {
      case 'disconnected':
        return <button onClick={handleStartConnection} className="bg-slate-900 text-white font-bold py-3 px-8 rounded-xl hover:bg-black transition-all shadow-lg hover:scale-105">بدء الجلسة</button>;
      case 'connecting':
        return <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full"></div>;
      case 'qr':
        return (
          <div className="text-center p-2">
            {qrCode ? (
              <QRCodeSVG value={qrCode} size={256} className="mx-auto mb-4 border-4 p-1 bg-white border-white rounded-lg shadow-xl" />
            ) : (
              <div className="mx-auto mb-4 w-64 h-64 bg-slate-200 animate-pulse rounded-lg"></div>
            )}
            <p className="text-xs font-bold text-slate-600">امسح الرمز باستخدام واتساب</p>
          </div>
        );
      case 'connected':
        return (
          <div className="text-center text-emerald-600">
            <CheckCircle2 size={48} className="mx-auto mb-2" />
            <p className="font-bold">الجهاز متصل بنجاح</p>
            <button onClick={handleDisconnect} className="text-[10px] text-rose-500 mt-2 font-bold uppercase hover:underline">إلغاء الربط</button>
          </div>
        );
      case 'error':
        return (
          <div className="text-center text-rose-600">
            <AlertTriangle size={48} className="mx-auto mb-2" />
            <p className="font-bold">حدث خطأ</p>
            <button onClick={handleStartConnection} className="text-[10px] text-slate-600 mt-2 font-bold uppercase hover:underline">إعادة المحاولة</button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      <aside className="w-64 bg-slate-900 text-white p-6 hidden lg:flex flex-col border-r border-slate-800">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-emerald-500 p-2 rounded-lg shadow-lg"><Zap size={20} fill="currentColor" /></div>
          <span className="font-bold text-lg tracking-tight">W-SaaS Gateway</span>
        </div>
        <nav className="space-y-2 flex-1">
          <button className="flex items-center gap-3 w-full p-3 rounded-xl bg-emerald-500 text-white font-bold"><LayoutDashboard size={18} />لوحة التحكم</button>
          <button className="flex items-center gap-3 w-full p-3 rounded-xl text-slate-400 hover:bg-white/5"><Smartphone size={18} />الأجهزة</button>
          <button className="flex items-center gap-3 w-full p-3 rounded-xl text-slate-400 hover:bg-white/5"><Key size={18} />API Keys</button>
        </nav>
        <div className="mt-auto border-t border-slate-800 pt-4">
          <button onClick={handleDisconnect} className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors w-full">
            <LogOut size={18} /><span className="font-bold">خروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-black text-slate-800">إدارة البوابة</h1>
              <p className="text-slate-400 text-sm">مرحباً بك في نظام الربط السحابي</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm text-xs font-bold text-slate-600">
              API Version: 2.1.0
            </div>
            {status === 'connected' && (
              <button
                onClick={handleLogout}
                className="bg-red-50 text-red-500 hover:bg-red-100 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors border border-red-100"
              >
                <LogOut size={14} /> خروج
              </button>
            )}
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="text-blue-500 mb-2"><Send size={20} /></div><div className="text-xs text-slate-400 font-bold uppercase">الرسائل اليومية</div><div className="text-xl font-black">1,240</div></div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="text-emerald-500 mb-2"><Smartphone size={20} /></div><div className="text-xs text-slate-400 font-bold uppercase">الأجهزة النشطة</div><div className="text-xl font-black">1 / 5</div></div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="text-amber-500 mb-2"><Clock size={20} /></div><div className="text-xs text-slate-400 font-bold uppercase">وقت التشغيل</div><div className="text-xl font-black">99.9%</div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm h-fit">
              <h3 className="font-bold mb-6 flex items-center gap-2"><QrIcon size={18} className="text-emerald-500" /> ربط جهاز واتساب</h3>
              <div className="aspect-square bg-slate-100 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center relative">
                {renderConnectionStatus()}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative shadow-lg">
                <h4 className="text-[10px] font-bold text-emerald-400 uppercase mb-4 tracking-widest">Master API Key</h4>
                <div className="bg-white/10 p-4 rounded-xl border border-white/10 flex items-center justify-between font-mono text-[11px]">
                  <code className="truncate text-white">{apiKey}</code>
                  <button onClick={copyApiKey} className="text-slate-300 hover:text-emerald-400 transition-colors">
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <Zap className="absolute -bottom-4 -right-4 w-24 h-24 text-white/5" />
              </div>

              {/* Message Sender Component */}
              <MessageSender socket={socketRef.current} status={status} />


              <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 font-mono text-[10px] text-white/60 h-48 flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-white/40">سجل أحداث النظام</span>
                  <RefreshCcw size={10} className={`${status === 'connecting' ? 'animate-spin' : ''}`} />
                </div>
                <div className="space-y-1.5 h-full overflow-y-auto pr-2 custom-scrollbar">
                  {logs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;