import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './src/components/Layout/Sidebar';
import Login from './src/pages/Login';
import Dashboard from './src/pages/Dashboard';
import Devices from './src/pages/Devices';
import Campaigns from './src/pages/Campaigns';
import ApiDocs from './src/pages/ApiDocs';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3050');

    socketRef.current.on('status', (newStatus: any) => {
      setStatus(newStatus);
    });

    socketRef.current.on('qr', (qrData: string) => {
      const cleanQR = qrData.replace('data:image/png;base64,', '');
      setQrCode(cleanQR);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const handleStartConnection = () => {
    socketRef.current?.emit('start-session');
  };

  const handleLogout = () => {
    if (confirm('هل أنت متأكد أنك تريد تسجيل الخروج؟')) {
      socketRef.current?.emit('logout');
    }
  };

  const handleAppLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isLoggedIn');
  };

  // Layout for authenticated pages
  const DashboardLayout = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    return (
      <div className="flex bg-slate-50 min-h-screen font-sans dir-rtl" dir="rtl">
        <Sidebar onLogout={handleAppLogout} />
        <main className="flex-1 mr-64 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={() => {
          setIsAuthenticated(true);
          localStorage.setItem('isLoggedIn', 'true');
        }} />} />

        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard socket={socketRef.current} />} />
          <Route path="/devices" element={
            <Devices
              socket={socketRef.current}
              status={status}
              qrCode={qrCode}
              onStartSession={handleStartConnection}
              onLogout={handleLogout}
            />
          } />
          <Route path="/campaigns" element={<Campaigns socket={socketRef.current} status={status} />} />
          <Route path="/api" element={<ApiDocs />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;