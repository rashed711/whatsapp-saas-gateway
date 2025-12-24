import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './src/components/Layout/Sidebar';
import Login from './src/pages/Login';
import Users from './src/pages/Users';
import Dashboard from './src/pages/Dashboard';
import Devices from './src/pages/Devices';
import Campaigns from './src/pages/Campaigns';
import { Menu } from 'lucide-react';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('token');
  });
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (isAuthenticated && token) {
      const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3050', {
        auth: { token }
      });
      setSocket(newSocket);

      newSocket.on('session-status', ({ status }: any) => {
        // Global status listener if needed, but pages handle their own specific session status usually
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isAuthenticated]);

  const handleAppLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn'); // Cleanup old key
    if (socket) socket.disconnect();
  };

  // Layout for authenticated pages
  const DashboardLayout = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
      <div className="flex bg-slate-50 min-h-screen font-sans dir-rtl" dir="rtl">
        <Sidebar
          onLogout={handleAppLogout}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? '' : ''} md:mr-64`}>
          {/* Mobile Header */}
          <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-30 shadow-md">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-emerald-500">WA</span> Gateway
            </h1>
            <button onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
          </div>

          <div className="p-4 md:p-8 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={() => {
          setIsAuthenticated(true);
        }} />} />

        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard socket={socket} />} />
          <Route path="/devices" element={<Devices socket={socket} />} />
          <Route path="/campaigns" element={<Campaigns socket={socket} />} />
          <Route path="/users" element={<Users />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;