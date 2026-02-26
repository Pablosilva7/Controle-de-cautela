import { useState, useEffect, FormEvent } from 'react';
import { 
  Key as KeyIcon, 
  History, 
  LayoutDashboard, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Filter,
  ChevronRight,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Key, Movement, Stats, CRQ } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keys' | 'history' | 'crqs'>('dashboard');
  const [keys, setKeys] = useState<Key[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [crqs, setCrqs] = useState<CRQ[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, inField: 0, available: 0, totalCrqs: 0, overdue: 0 });
  const [firebaseStatus, setFirebaseStatus] = useState<{ 
    initialized: boolean; 
    error: string | null;
    config?: {
      projectId: boolean;
      clientEmail: boolean;
      privateKeyPresent: boolean;
      privateKeyFormatValid: boolean;
      pastedWholeJson: boolean;
    }
  }>({ initialized: false, error: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Key | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState<Key | null>(null);
  const [showAddCrqModal, setShowAddCrqModal] = useState(false);
  const [keySearchQuery, setKeySearchQuery] = useState('');
  
  // Form states
  const [newKey, setNewKey] = useState({ id: '', name: '', description: '' });
  const [editKeyForm, setEditKeyForm] = useState({ id: '', name: '', description: '' });
  const [checkoutForm, setCheckoutForm] = useState({ technician_name: '', company: '', crq: '', return_date: '' });
  const [newCrq, setNewCrq] = useState({ id: '', technician: '', technician_phone: '', company: '', selectedKeys: [] as string[] });

  const fetchData = async () => {
    try {
      console.log('Buscando dados...');
      const [keysRes, movementsRes, statsRes, crqsRes, healthRes] = await Promise.all([
        fetch('/api/keys'),
        fetch('/api/movements'),
        fetch('/api/stats'),
        fetch('/api/crqs'),
        fetch('/api/health')
      ]);
      
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        console.log('Chaves carregadas:', keysData.length);
        setKeys(keysData);
      }
      if (movementsRes.ok) setMovements(await movementsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (crqsRes.ok) setCrqs(await crqsRes.json());
      if (healthRes.ok) {
        const health = await healthRes.json();
        console.log('Status Firebase:', health.firebase);
        setFirebaseStatus(health.firebase);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddKey = async (e: FormEvent) => {
    e.preventDefault();
    console.log('Tentando cadastrar chave:', newKey);

    if (!firebaseStatus.initialized) {
      alert(`Erro: O Firebase não está conectado. Motivo: ${firebaseStatus.error || 'Configuração incompleta'}`);
      return;
    }
    
    // Check for duplicate ID
    if (keys.some(k => k.id.toLowerCase() === newKey.id.toLowerCase())) {
      alert(`Erro: Já existe uma chave cadastrada com o ID "${newKey.id}".`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKey)
      });
      const data = await res.json();
      console.log('Resposta do servidor:', data);
      if (res.ok) {
        setShowAddModal(false);
        setNewKey({ id: '', name: '', description: '' });
        fetchData();
      } else {
        alert(`Erro ao cadastrar chave: ${data.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro na requisição:', error);
      alert('Erro de rede ao tentar cadastrar chave.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const testFirebaseConnection = async () => {
    setIsTestingConnection(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.firebase.initialized) {
        alert('Conexão com Firebase estabelecida com sucesso!');
      } else {
        alert(`Erro na conexão: ${data.firebase.error}`);
      }
      setFirebaseStatus(data.firebase);
    } catch (error) {
      alert('Erro ao testar conexão.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleEditKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;

    const res = await fetch(`/api/keys/${showEditModal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editKeyForm)
    });
    if (res.ok) {
      setShowEditModal(null);
      fetchData();
    } else {
      alert('Erro ao atualizar chave.');
    }
  };

  const handleAddCrq = async (e: FormEvent) => {
    e.preventDefault();
    
    // Check for duplicate CRQ ID
    if (crqs.some(c => c.id.toLowerCase() === newCrq.id.toLowerCase())) {
      alert(`Erro: Já existe uma CRQ/OS cadastrada com o ID "${newCrq.id}".`);
      return;
    }

    if (newCrq.selectedKeys.length === 0) {
      alert('Selecione pelo menos uma chave.');
      return;
    }

    if (!confirm(`Deseja confirmar a criação da CRQ/OS ${newCrq.id} com ${newCrq.selectedKeys.length} chaves?`)) {
      return;
    }

    const res = await fetch('/api/crqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newCrq.id,
        technician: newCrq.technician,
        technician_phone: newCrq.technician_phone,
        company: newCrq.company,
        keyIds: newCrq.selectedKeys
      })
    });
    const data = await res.json();
    if (res.ok) {
      setShowAddCrqModal(false);
      setNewCrq({ id: '', technician: '', technician_phone: '', company: '', selectedKeys: [] as string[] });
      setKeySearchQuery('');
      fetchData();
    } else {
      alert(`Erro ao criar CRQ: ${data.error || 'Erro desconhecido'}`);
    }
  };

  const handleCloseCrq = async (crqId: string) => {
    if (!confirm(`Deseja dar baixa (encerrar) a CRQ/OS ${crqId}? Todas as chaves vinculadas ficarão disponíveis.`)) {
      return;
    }

    const res = await fetch(`/api/crqs/${crqId}/close`, {
      method: 'POST'
    });
    const data = await res.json();
    if (res.ok) {
      fetchData();
    } else {
      alert(`Erro ao encerrar CRQ: ${data.error || 'Erro desconhecido'}`);
    }
  };

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!showCheckoutModal) return;
    
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key_id: showCheckoutModal.id,
        technician_name: checkoutForm.technician_name,
        company: checkoutForm.company,
        crq: checkoutForm.crq,
        expected_return: checkoutForm.return_date
      })
    });
    if (res.ok) {
      setShowCheckoutModal(null);
      setCheckoutForm({ technician_name: '', company: '', crq: '', return_date: '' });
      fetchData();
    }
  };

  const handleCheckin = async (keyId: string) => {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId })
    });
    if (res.ok) fetchData();
  };

  const filteredKeys = keys.filter(k => 
    k.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    k.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isOverdue = (movement: Movement) => {
    if (movement.checkin_time) return false;
    if (!movement.expected_return) return false;
    return new Date(movement.expected_return) < new Date();
  };

  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-3 text-emerald-600">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <KeyIcon size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-zinc-900">KeyGuard</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('keys')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'keys' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <KeyIcon size={20} />
            <span className="font-medium">Chaves</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <History size={20} />
            <span className="font-medium">Histórico</span>
          </button>
          <button 
            onClick={() => setActiveTab('crqs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'crqs' ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <FileText size={20} />
            <span className="font-medium">CRQs / OS</span>
          </button>
        </nav>

        <div className="p-6 border-t border-zinc-100">
          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2">Sistema Ativo</p>
            <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'keys' && 'Gerenciamento de Chaves'}
              {activeTab === 'history' && 'Histórico de Cautelas'}
              {activeTab === 'crqs' && 'Gerenciamento de CRQs / OS'}
            </h2>
            <p className="text-zinc-500">Bem-vindo ao painel de controle de chaves.</p>
          </div>
          
          <div className="flex items-center gap-4">
            {!firebaseStatus.initialized && (
              <div className="bg-rose-100 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 animate-pulse">
                <AlertCircle size={14} />
                Firebase Desconectado
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {activeTab === 'keys' && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-zinc-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-sm"
              >
                <Plus size={18} />
                Cadastrar Chave
              </button>
            )}
            {activeTab === 'crqs' && (
              <button 
                onClick={() => setShowAddCrqModal(true)}
                className="bg-zinc-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-sm"
              >
                <Plus size={18} />
                Criar CRQ / OS
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Firebase Status Alert */}
              {!firebaseStatus.initialized && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start gap-3 text-rose-700">
                  <AlertCircle className="shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <h4 className="font-bold">Erro de Conexão com Firebase</h4>
                    <p className="text-sm opacity-90 mb-3">{firebaseStatus.error || 'Verifique suas variáveis de ambiente.'}</p>
                    
                    {firebaseStatus.config && (
                      <div className="bg-white/50 p-3 rounded-xl text-xs font-mono grid grid-cols-2 gap-2">
                        <div>Project ID: {firebaseStatus.config.projectId ? '✅' : '❌'}</div>
                        <div>Client Email: {firebaseStatus.config.clientEmail ? '✅' : '❌'}</div>
                        <div>Private Key: {firebaseStatus.config.privateKeyPresent ? '✅' : '❌'}</div>
                        <div>Key Format: {firebaseStatus.config.privateKeyFormatValid ? '✅' : '❌'}</div>
                      </div>
                    )}

                    {firebaseStatus.config?.pastedWholeJson && (
                      <div className="mt-3 p-3 bg-amber-100 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                        <div className="font-bold flex items-center gap-1 mb-1">
                          <AlertCircle size={14} />
                          Aviso: Formato Incorreto
                        </div>
                        Parece que você colou o arquivo JSON inteiro em um dos campos. 
                        Você deve extrair apenas os valores específicos (id, email e private_key) para cada variável separada.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {firebaseStatus.initialized && keys.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center">
                  <div className="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-bold text-emerald-900">Conectado ao Firebase!</h4>
                  <p className="text-emerald-700 text-sm mb-4">Seu banco de dados está vazio. Comece cadastrando sua primeira chave.</p>
                  <button 
                    onClick={() => {
                      setActiveTab('keys');
                      setShowAddModal(true);
                    }}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Cadastrar Primeira Chave
                  </button>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {[
                  { label: 'Total de Chaves', value: stats.total, icon: KeyIcon, color: 'zinc' },
                  { label: 'Em Campo', value: stats.inField, icon: ArrowUpRight, color: 'amber' },
                  { label: 'Disponíveis', value: stats.available, icon: CheckCircle2, color: 'emerald' },
                  { label: 'Total de CRQs', value: stats.totalCrqs, icon: FileText, color: 'indigo' },
                  { label: 'Atrasadas', value: stats.overdue, icon: AlertCircle, color: 'rose' },
                ].map((stat, i) => (
                  <div key={i} className="glass-card p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-2 rounded-lg bg-${stat.color}-100 text-${stat.color}-600`}>
                        <stat.icon size={20} />
                      </div>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium">{stat.label}</p>
                    <h3 className="text-3xl font-bold mt-1">{stat.value}</h3>
                  </div>
                ))}
              </div>

              {/* Recent Activity & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 glass-card overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Movimentações Recentes</h3>
                    <button onClick={() => setActiveTab('history')} className="text-sm text-zinc-500 hover:text-zinc-900 flex items-center gap-1">
                      Ver tudo <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {movements.slice(0, 5).map((m) => (
                      <div key={m.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${m.checkin_time ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {m.checkin_time ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900">{m.key_name} <span className="text-zinc-400 font-normal">({m.key_id})</span></p>
                            <p className="text-xs text-zinc-500 flex items-center gap-1">
                              <User size={12} /> {m.technician_name} ({m.company}) • CRQ: {m.crq}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">{new Date(m.checkout_time).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`status-pill ${m.checkin_time ? 'status-available' : 'status-in-field'}`}>
                            {m.checkin_time ? 'Devolvida' : 'Em Campo'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {movements.length === 0 && (
                      <div className="p-12 text-center text-zinc-400">
                        Nenhuma movimentação registrada.
                      </div>
                    )}
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="font-bold text-lg mb-4">Alertas de Atraso</h3>
                  <div className="space-y-4">
                    {movements.filter(isOverdue).map(m => (
                      <div key={m.id} className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                        <div className="flex items-center gap-2 text-rose-600 mb-1">
                          <AlertCircle size={16} />
                          <span className="text-sm font-bold">Atraso Crítico</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-900">{m.key_name}</p>
                        <p className="text-xs text-zinc-500">Técnico: {m.technician_name}</p>
                        <p className="text-xs text-zinc-500">Empresa: {m.company}</p>
                        <p className="text-xs text-rose-600 mt-2 font-medium">
                          Vencimento: {new Date(m.expected_return!).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                    {movements.filter(isOverdue).length === 0 && (
                      <div className="text-center py-8">
                        <div className="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                          <CheckCircle2 size={24} />
                        </div>
                        <p className="text-sm text-zinc-500">Tudo em dia!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'keys' && (
            <motion.div 
              key="keys"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card overflow-hidden"
            >
              <div className="grid grid-cols-5 bg-zinc-50 py-4 px-6 border-b border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <div>ID Chave</div>
                <div>Nome</div>
                <div>Descrição</div>
                <div>Status</div>
                <div className="text-right">Ações</div>
              </div>
              <div className="divide-y divide-zinc-100">
                {filteredKeys.map((key) => (
                  <div key={key.id} className="grid grid-cols-5 border-b border-zinc-100 py-4 px-6 items-center hover:bg-zinc-50 transition-colors">
                    <div className="font-mono text-sm text-zinc-600">{key.id}</div>
                    <div className="font-semibold">{key.name}</div>
                    <div className="text-sm text-zinc-500 truncate pr-4">{key.description || '-'}</div>
                    <div>
                      <span className={`status-pill ${key.status === 'available' ? 'status-available' : 'status-in-field'}`}>
                        {key.status === 'available' ? 'Disponível' : 'Em Campo'}
                      </span>
                    </div>
                    <div className="text-right flex items-center justify-end gap-4">
                      <button 
                        onClick={() => {
                          setShowEditModal(key);
                          setEditKeyForm({ id: key.id, name: key.name, description: key.description || '' });
                        }}
                        className="text-sm font-bold text-zinc-500 hover:text-zinc-900 underline underline-offset-4"
                      >
                        Editar
                      </button>
                      {key.status === 'available' ? (
                        <button 
                          onClick={() => setShowCheckoutModal(key)}
                          className="text-sm font-bold text-emerald-600 hover:text-emerald-700 underline underline-offset-4"
                        >
                          Retirar
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleCheckin(key.id)}
                          className="text-sm font-bold text-amber-600 hover:text-amber-700 underline underline-offset-4"
                        >
                          Devolver
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'crqs' && (
            <motion.div 
              key="crqs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card overflow-hidden"
            >
              <div className="grid grid-cols-7 bg-zinc-50 py-4 px-6 border-b border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <div>ID CRQ / OS</div>
                <div>Técnico</div>
                <div>Telefone</div>
                <div>Empresa</div>
                <div>Data Criação</div>
                <div>Status</div>
                <div className="text-right">Ações</div>
              </div>
              <div className="divide-y divide-zinc-100">
                {crqs.map((crq) => (
                  <div key={crq.id} className="grid grid-cols-7 border-b border-zinc-100 py-4 px-6 items-center hover:bg-zinc-50 transition-colors">
                    <div className="font-mono text-sm font-bold">{crq.id}</div>
                    <div className="text-sm">{crq.technician}</div>
                    <div className="text-sm text-zinc-500">{crq.technician_phone || '-'}</div>
                    <div className="text-sm">{crq.company}</div>
                    <div className="text-sm text-zinc-500">{new Date(crq.created_at).toLocaleString()}</div>
                    <div>
                      <span className={`status-pill ${crq.status === 'open' ? 'status-in-field' : 'status-available'}`}>
                        {crq.status === 'open' ? 'Aberta' : 'Fechada'}
                      </span>
                    </div>
                    <div className="text-right">
                      {crq.status === 'open' && (
                        <button 
                          onClick={() => handleCloseCrq(crq.id)}
                          className="text-sm font-bold text-rose-600 hover:text-rose-700 underline underline-offset-4"
                        >
                          Dar Baixa
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {crqs.length === 0 && (
                  <div className="p-12 text-center text-zinc-400">
                    Nenhuma CRQ / OS registrada.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card overflow-hidden"
            >
              <div className="grid grid-cols-6 bg-zinc-50 py-4 px-6 border-b border-zinc-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <div>Chave</div>
                <div>Técnico</div>
                <div>Empresa</div>
                <div>Retirada</div>
                <div>Devolução</div>
                <div>Status</div>
              </div>
              <div className="divide-y divide-zinc-100">
                {movements.map((m) => (
                  <div key={m.id} className="grid grid-cols-6 border-b border-zinc-100 py-4 px-6 items-center hover:bg-zinc-50 transition-colors">
                    <div>
                      <p className="font-semibold">{m.key_name}</p>
                      <p className="text-[10px] font-mono text-zinc-400">{m.key_id}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User size={14} className="text-zinc-400" />
                      {m.technician_name}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {m.company}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {new Date(m.checkout_time).toLocaleString()}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {m.checkin_time ? new Date(m.checkin_time).toLocaleString() : '-'}
                    </div>
                    <div>
                      {m.checkin_time ? (
                        <span className="status-pill status-available">Concluído</span>
                      ) : isOverdue(m) ? (
                        <span className="status-pill status-overdue">Atrasado</span>
                      ) : (
                        <span className="status-pill status-in-field">Ativo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-6">Cadastrar Nova Chave</h3>
            
            {!firebaseStatus.initialized && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertCircle size={16} />
                  Erro de Conexão
                </div>
                <div className="mb-2">{firebaseStatus.error || 'O Firebase não está configurado corretamente.'}</div>
                
                {firebaseStatus.config && (
                  <div className="bg-white/50 p-2 rounded-lg text-[10px] font-mono space-y-1">
                    <div>Project ID: {firebaseStatus.config.projectId ? '✅' : '❌'}</div>
                    <div>Client Email: {firebaseStatus.config.clientEmail ? '✅' : '❌'}</div>
                    <div>Private Key: {firebaseStatus.config.privateKeyPresent ? '✅' : '❌'}</div>
                    <div>Key Format: {firebaseStatus.config.privateKeyFormatValid ? '✅' : '❌'}</div>
                  </div>
                )}

                {firebaseStatus.config?.pastedWholeJson && (
                  <div className="mt-2 p-2 bg-amber-100 border border-amber-200 rounded-lg text-amber-800 text-[10px]">
                    <strong>Aviso:</strong> Você colou o JSON inteiro em vez de apenas o valor.
                  </div>
                )}

                <button 
                  type="button"
                  onClick={testFirebaseConnection}
                  disabled={isTestingConnection}
                  className="mt-3 text-xs underline font-bold block"
                >
                  {isTestingConnection ? 'Testando...' : 'Tentar reconectar agora'}
                </button>
              </div>
            )}

            <form onSubmit={handleAddKey} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">ID Único (ex: IH234)</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={newKey.id}
                  onChange={e => setNewKey({...newKey, id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nome da Chave (ex: PA GDR)</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={newKey.name}
                  onChange={e => setNewKey({...newKey, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Descrição / Observações</label>
                <textarea 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none resize-none"
                  rows={3}
                  value={newKey.description}
                  onChange={e => setNewKey({...newKey, description: e.target.value})}
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-6">Editar Chave</h3>
            <form onSubmit={handleEditKey} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">ID Único (Cuidado ao alterar)</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={editKeyForm.id}
                  onChange={e => setEditKeyForm({...editKeyForm, id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nome da Chave</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={editKeyForm.name}
                  onChange={e => setEditKeyForm({...editKeyForm, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Descrição / Observações</label>
                <textarea 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none resize-none"
                  rows={3}
                  value={editKeyForm.description}
                  onChange={e => setEditKeyForm({...editKeyForm, description: e.target.value})}
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAddCrqModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-6">Criar Nova CRQ / OS</h3>
            <form onSubmit={handleAddCrq} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">ID CRQ / OS</label>
                  <input 
                    required
                    type="text" 
                    placeholder="ex: CRQ12345"
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                    value={newCrq.id}
                    onChange={e => setNewCrq({...newCrq, id: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Empresa</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                    value={newCrq.company}
                    onChange={e => setNewCrq({...newCrq, company: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Técnico Responsável</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                    value={newCrq.technician}
                    onChange={e => setNewCrq({...newCrq, technician: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone do Técnico</label>
                  <input 
                    type="tel" 
                    placeholder="(00) 00000-0000"
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                    value={newCrq.technician_phone}
                    onChange={e => setNewCrq({...newCrq, technician_phone: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-medium text-zinc-700">Selecionar Chaves (Múltiplas)</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Filtrar chaves..." 
                      className="pl-8 pr-3 py-1 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900/20"
                      value={keySearchQuery}
                      onChange={(e) => setKeySearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                  {keys
                    .filter(key => 
                      (key.name.toLowerCase().includes(keySearchQuery.toLowerCase()) || 
                       key.id.toLowerCase().includes(keySearchQuery.toLowerCase()))
                    )
                    .map(key => (
                    <label key={key.id} className={`flex items-center gap-3 p-3 hover:bg-zinc-50 cursor-pointer transition-colors ${key.status !== 'available' && !newCrq.selectedKeys.includes(key.id) ? 'opacity-50' : ''}`}>
                      <input 
                        type="checkbox"
                        disabled={key.status !== 'available' && !newCrq.selectedKeys.includes(key.id)}
                        className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 disabled:opacity-50"
                        checked={newCrq.selectedKeys.includes(key.id)}
                        onChange={(e) => {
                          const selected = e.target.checked 
                            ? [...newCrq.selectedKeys, key.id]
                            : newCrq.selectedKeys.filter(id => id !== key.id);
                          setNewCrq({...newCrq, selectedKeys: selected});
                        }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{key.name}</p>
                        <p className="text-xs text-zinc-400 font-mono">{key.id}</p>
                      </div>
                      <span className={`status-pill ${key.status === 'available' ? 'status-available' : 'status-in-field'}`}>
                        {key.status === 'available' ? 'Disp.' : 'Em Campo'}
                      </span>
                    </label>
                  ))}
                  {keys.filter(key => 
                    (key.name.toLowerCase().includes(keySearchQuery.toLowerCase()) || 
                     key.id.toLowerCase().includes(keySearchQuery.toLowerCase()))
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs text-zinc-400">Nenhuma chave encontrada.</div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowAddCrqModal(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  Criar CRQ / OS
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                <ArrowUpRight size={24} />
              </div>
              <h3 className="text-xl font-bold">Retirada de Chave</h3>
            </div>
            <p className="text-zinc-500 text-sm mb-6">
              Você está registrando a retirada da chave <span className="font-bold text-zinc-900">{showCheckoutModal.name}</span>.
            </p>
            <form onSubmit={handleCheckout} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">ID da Chave</label>
                  <input 
                    disabled
                    type="text" 
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500"
                    value={showCheckoutModal.id}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome da Chave</label>
                  <input 
                    disabled
                    type="text" 
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500"
                    value={showCheckoutModal.name}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Técnico</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={checkoutForm.technician_name}
                  onChange={e => setCheckoutForm({...checkoutForm, technician_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Empresa</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={checkoutForm.company}
                  onChange={e => setCheckoutForm({...checkoutForm, company: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">CRQ / Ordem de Serviço</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={checkoutForm.crq}
                  onChange={e => setCheckoutForm({...checkoutForm, crq: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Data Prevista de Devolução</label>
                <input 
                  required
                  type="datetime-local" 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/10 outline-none"
                  value={checkoutForm.return_date}
                  onChange={e => setCheckoutForm({...checkoutForm, return_date: e.target.value})}
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowCheckoutModal(null)}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors"
                >
                  Confirmar Retirada
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
