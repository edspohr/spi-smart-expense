import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/useAuth';
import { FileText, Receipt, ArrowRight } from 'lucide-react';

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function AdminModuleSelector() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect to the only module available
    navigate('/admin', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="mt-4 text-slate-500">Redirigiendo...</p>
    </div>
  );
}
