import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ForcePasswordChange from './ForcePasswordChange';
import PageTransition from './PageTransition';
import { useLocation } from 'react-router-dom';

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser } = useAuth();
  const [mustChangePass, setMustChangePass] = useState(false);
  const location = useLocation();

  useEffect(() => {
    async function checkUserStatus() {
        if (!currentUser) return;
        try {
            const userRef = doc(db, "users", currentUser.uid);
            const snap = await getDoc(userRef);
            if (snap.exists() && snap.data().forcePasswordChange) {
                setMustChangePass(true);
            }
        } catch (e) {
            console.error(e);
        }
    }
    checkUserStatus();
  }, [currentUser]);

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden font-sans">
      {mustChangePass && currentUser && <ForcePasswordChange user={currentUser} />}
      
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="flex justify-between items-center px-8 py-5 glass-header z-20 bg-white/60 backdrop-blur-md sticky top-0 border-b border-zinc-200/50">
            <div className="flex items-center">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden mr-4 text-zinc-500 hover:text-zinc-800 transition">
                    <Menu className="w-6 h-6" />
                </button>
                <h1 className="text-xl md:text-2xl font-bold text-zinc-800 tracking-tight">{title}</h1>
            </div>
            <div>
                {/* Notification Icon or future user menu */}
            </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-50/50 p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <PageTransition key={location.pathname}>
                    {children}
                </PageTransition>
            </div>
        </main>
        
        {/* Mobile Overlay */}
        {sidebarOpen && (
            <div 
                className="fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-10 md:hidden transition-opacity" 
                onClick={() => setSidebarOpen(false)}
            ></div>
        )}
      </div>
    </div>
  );
}
