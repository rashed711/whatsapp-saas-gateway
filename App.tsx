import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './src/components/Layout/Sidebar';
import Login from './src/pages/Login';
import Dashboard from './src/pages/Dashboard';
import Devices from './src/pages/Devices';
import Campaigns from './src/pages/Campaigns';


const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3050');
    setSocket(newSocket);

    newSocket.on('status', (newStatus: any) => {
      setStatus(newStatus);
    });

    newSocket.on('qr', (qrData: string) => {
      const cleanQR = qrData.replace('data:image/png;base64,', '');
      setQrCode(cleanQR);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleStartConnection = () => {
    socket?.emit('start-session');
  };

  const handleLogout = () => {
    if (confirm('هل أنت متأكد أنك تريد تسجيل الخروج؟')) {
      socket?.emit('logout');
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
          <Route path="/" element={<Dashboard socket={socket} />} />
          <Route path="/devices" element={<Devices socket={socket} />} />
          <Route path="/campaigns" element={<Campaigns socket={socket} />} />

        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;