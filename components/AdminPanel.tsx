import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Key, LogOut, Check, Copy, AlertTriangle, Calendar } from 'lucide-react';
import { getStoredLicenses, addLicense, removeLicense, hashString, LicenseEntry } from '../services/authService';

interface AdminPanelProps {
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout }) => {
  const [licenses, setLicenses] = useState<LicenseEntry[]>([]);
  const [newLicenseName, setNewLicenseName] = useState('');
  const [newLicenseCode, setNewLicenseCode] = useState('');
  
  // State to show the plaintext code one last time after creation
  const [lastCreated, setLastCreated] = useState<{name: string, code: string} | null>(null);

  useEffect(() => {
    // When component mounts, getStoredLicenses will auto-heal any legacy data
    setLicenses(getStoredLicenses());
  }, []);

  const handleAdd = async () => {
    if (!newLicenseName || !newLicenseCode) return;
    
    const hash = await hashString(newLicenseCode);
    addLicense(newLicenseName, hash);
    
    setLicenses(getStoredLicenses());
    
    // Show the success message with the plaintext code
    setLastCreated({ name: newLicenseName, code: newLicenseCode });
    
    // Clear inputs
    setNewLicenseName('');
    setNewLicenseCode('');
  };

  const handleDelete = (id: string) => {
    // Removed window.confirm because it is often blocked in sandboxed environments (like the preview window),
    // causing the delete action to fail silently.
    setLicenses(prev => prev.filter(l => l.id !== id));
    removeLicense(id);
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-red-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">License Management System</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create License */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-neon-green" /> Issue New License
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-gray-500 mb-1 block">USER / CLIENT NAME</label>
                <input 
                  type="text" 
                  value={newLicenseName}
                  onChange={(e) => setNewLicenseName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:border-neon-green focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-gray-500 mb-1 block">LICENSE CODE (PLAINTEXT)</label>
                <input 
                  type="text" 
                  value={newLicenseCode}
                  onChange={(e) => setNewLicenseCode(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:border-neon-green focus:outline-none"
                  placeholder="e.g. SECRET-KEY-123"
                />
              </div>

              <button 
                onClick={handleAdd}
                disabled={!newLicenseName || !newLicenseCode}
                className="w-full bg-neon-green hover:bg-green-500 text-black font-bold py-3 rounded-lg transition-all disabled:opacity-50"
              >
                Create License
              </button>

              {lastCreated && (
                <div className="mt-4 p-4 bg-green-900/20 border border-green-800 rounded-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm text-green-400 font-bold mb-1">LICENSE ISSUED SUCCESSFULLY!</p>
                        <p className="text-xs text-gray-400 mb-2">
                            Please copy and send this code to the client immediately. 
                            <span className="text-red-400 block mt-1 font-bold">
                                <AlertTriangle className="w-3 h-3 inline mr-1"/>
                                For security, this code will NOT be shown again.
                            </span>
                        </p>
                        <div className="bg-black/50 p-2 rounded border border-green-900/50 flex justify-between items-center">
                            <code className="text-sm font-mono text-white font-bold tracking-wide">
                                {lastCreated.code}
                            </code>
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(lastCreated.code);
                                    alert('Copied to clipboard');
                                }}
                                className="text-xs bg-green-800 hover:bg-green-700 text-white px-2 py-1 rounded"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Licenses */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col h-full">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-neon-purple" /> Active Local Licenses
            </h2>
            
            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-[200px] max-h-[400px]">
              {licenses.length === 0 ? (
                <p className="text-gray-500 text-sm italic text-center py-10 border border-dashed border-gray-800 rounded-lg">
                    No local licenses issued yet.
                </p>
              ) : (
                licenses.map((lic) => (
                  <div key={lic.id} className="bg-gray-950 p-3 rounded-lg border border-gray-800 flex justify-between items-center group hover:border-gray-600 transition-colors">
                    <div>
                      <h4 className="font-bold text-gray-200">{lic.name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                         <Calendar className="w-3 h-3" />
                         <span className="font-mono">Created: {formatDate(lic.createdAt)}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(lic.id)}
                      className="text-gray-600 hover:text-red-500 p-2 transition-colors rounded hover:bg-red-900/10"
                      title="Revoke License"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800">
               <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase">System Defaults</h3>
               <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Check className="w-3 h-3 text-green-500" /> Default User: <code className="bg-gray-800 px-1 rounded text-xs">STYLE-VIP-2024</code>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                     <Shield className="w-3 h-3 text-red-500" /> Admin Pass: <code className="bg-gray-800 px-1 rounded text-xs">MASTER-ADMIN-2024</code>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;