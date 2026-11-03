import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ForcePasswordChange from './ForcePasswordChange';
import PageTransition from './PageTransition';
import NotificationBell from './NotificationBell';
import InstallButton from './InstallButton';
import PinSetupBanner from './PinSetupBanner';
import ConnectionStatus from './ConnectionStatus';
import { useLocation } from 'react-router-dom';
import DemoBar from './DemoBar';
import { useTenantSettings } from '../context/SettingsContext';
import { getFieldReady, onMeteredConnection, prepareForField, shouldAutoPrepare } from '../lib/fieldReady';
import { fieldReadyCopy } from '../lib/fieldReadyCopy';
import { isOnline } from '../lib/connectivity';
import { isStandalone } from '../lib/install';
import { toast } from 'sonner';

// "Listo para terreno" prepares itself once per session (Ola 8): the first
// time the installed app opens with a session, and again when the kit is
// older than 12 h. Only the first success is announced, briefly.
let fieldPrepareStarted = false;

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser } = useAuth();
  const [mustChangePass, setMustChangePass] = useState(false);
  const location = useLocation();
  const { offline } = useTenantSettings();

  useEffect(() => {
    if (fieldPrepareStarted || !currentUser) return undefined;
    const mode = shouldAutoPrepare({
      localReader: offline.localReader,
      signedIn: true,
      online: isOnline(),
      installed: isStandalone(),
      metered: onMeteredConnection(),
      status: getFieldReady(),
    });
    if (!mode) return undefined;
    fieldPrepareStarted = true;
    let fired = false;
    const t = setTimeout(() => {
      fired = true;
      const run = prepareForField(currentUser.uid).then((next) => {
        if (!next.engines) throw new Error('engines');
      });
      // One quiet confirmation the first time; failures stay silent and are
      // retried on the next open of the app (the flag resets on reload).
      run.then(() => { if (mode === 'first') toast.success(fieldReadyCopy.readyToast); }).catch(() => {});
    }, 5000);
    // Layout remounts on every page: a pending start moves to the next page,
    // a download already running is left alone.
    return () => { if (!fired) { clearTimeout(t); fieldPrepareStarted = false; } };
  }, [offline.localReader, currentUser]);

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
        <DemoBar />
        <header className="flex justify-between items-center px-8 py-5 glass-header z-20 bg-white/60 backdrop-blur-md sticky top-0 border-b border-zinc-200/50">
            <div className="flex items-center">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden mr-4 text-chrome-muted hover:text-chrome-fg transition">
                    <Menu className="w-6 h-6" />
                </button>
                <h1 className="text-xl md:text-2xl font-bold text-chrome-fg tracking-tight">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
                <ConnectionStatus />
                <InstallButton variant="pill" className="hidden sm:inline-flex" />
                <NotificationBell />
            </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-50/50 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <PinSetupBanner />
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
