import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'suspended' | 'completed' | 'archived';
  department: string;
  project_type: string;
  metadata_json: Record<string, any>;
}

interface LedgerSummary {
  project_id: string;
  project_code: string;
  project_name: string;
  metrics: Record<string, number>;
}

interface BudgetMatrix {
  budget_ceiling: number;
  total_actual_spent: number;
  variance: number;
  breakdown: Record<string, number>;
}

const PRESET_TEMPLATES = [
  { name: 'Agricultural Farm Development', department: 'Agriculture', type: 'Farming', fields: { crop_type: 'Wheat/Corn', acreage: 50, irrigation_system: 'Drip', estimated_budget: 60000 } },
  { name: 'EPC Construction Project', department: 'Engineering', type: 'Construction', fields: { estimated_budget: 120000, contractor: '', site_location: 'Sana\'a' } },
  { name: 'Logistics & Fleet Transport', department: 'Logistics', type: 'Transport', fields: { vehicle_class: 'Heavy Truck', estimated_budget: 30000 } },
  { name: 'Custom Blank Template', department: 'General', type: 'Custom', fields: { estimated_budget: 10000 } }
];

export const PlanningHubView: React.FC = () => {
  // Main Module Navigation State (Operations vs Planning Department)
  const [currentModule, setCurrentModule] = useState<'operations' | 'planning'>('planning');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [budgetMatrix, setBudgetMatrix] = useState<BudgetMatrix | null>(null);
  
  // View & Filter States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'templates'>('dashboard');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Creation / Wizard State
  const [isCreating, setIsCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDept, setNewDept] = useState('Engineering');
  const [newType, setNewType] = useState('EPC');
  const [selectedTemplate, setSelectedTemplate] = useState(PRESET_TEMPLATES[0]);
  const [customFields, setCustomFields] = useState<Record<string, any>>(PRESET_TEMPLATES[0].fields);

  // Approval & Gateway States
  const [approvalRole, setApprovalRole] = useState('CFO');
  const [approvalComment, setApprovalComment] = useState('');

  const [customTemplates, setCustomTemplates] = useState(PRESET_TEMPLATES);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const fetchProjects = async () => {
    try {
      const res = await axios.get('/api/planning/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleTemplateChange = (tmplName: string) => {
    const tmpl = customTemplates.find(t => t.name === tmplName);
    if (tmpl) {
      setSelectedTemplate(tmpl);
      setNewDept(tmpl.department);
      setNewType(tmpl.type);
      setCustomFields({ ...tmpl.fields });
    }
  };

  const handleAddFieldToTemplate = () => {
    if (!newFieldKey) return;
    const updatedFields = { ...customFields, [newFieldKey]: newFieldValue };
    setCustomFields(updatedFields);
    setNewFieldKey('');
    setNewFieldValue('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/planning/projects', {
        code: newCode,
        name: newName,
        description: newDesc,
        status: 'draft',
        department: newDept,
        project_type: newType,
        metadata_json: customFields
      });
      setIsCreating(false);
      setNewCode('');
      setNewName('');
      setNewDesc('');
      fetchProjects();
      setActiveTab('projects');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create project spine.');
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/planning/projects/${projectId}`, { status: newStatus });
      setProjects(projects.map(p => p.id === projectId ? res.data : p));
      if (selectedProject?.id === projectId) {
        setSelectedProject(res.data);
      }
    } catch (err) {
      alert('Failed to update project status.');
    }
  };

  const loadSummary = async (projectId: string) => {
    try {
      const res = await axios.get(`/api/planning/projects/${projectId}/ledger-summary`);
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load ledger summary', err);
    }
  };

  const loadBudgetMatrix = async (projectId: string) => {
    try {
      const res = await axios.get(`/api/planning/projects/${projectId}/budget-matrix`);
      setBudgetMatrix(res.data);
    } catch (err) {
      console.error('Failed to load budget matrix', err);
    }
  };

  const handleApprovalAction = async (action: string) => {
    if (!selectedProject) return;
    try {
      const res = await axios.post(`/api/planning/projects/${selectedProject.id}/approval`, {
        action,
        approver_role: approvalRole,
        comments: approvalComment
      });
      setSelectedProject(res.data);
      alert(`Project successfully updated via gateway action: ${action}`);
      fetchProjects();
      loadBudgetMatrix(selectedProject.id);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Approval action failed.');
    }
  };

  const filteredProjects = projects.filter(p => {
    if (filterDept !== 'all' && p.department !== filterDept) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif', color: '#1f2937', background: '#f8fafc', minHeight: '100vh' }}>
      
      {/* Main Menu Navigation Bar (Operations vs Planning Department) */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', alignItems: 'center' }}>
        <button 
          onClick={() => setCurrentModule('operations')} 
          style={{ 
            background: currentModule === 'operations' ? '#2563eb' : '#f1f5f9', 
            color: currentModule === 'operations' ? 'white' : '#334155', 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            fontWeight: 600, 
            cursor: 'pointer',
            fontSize: '15px'
          }}
        >
          ⚙️ Operations
        </button>

        <button 
          onClick={() => setCurrentModule('planning')} 
          style={{ 
            background: currentModule === 'planning' ? '#2563eb' : '#f1f5f9', 
            color: currentModule === 'planning' ? 'white' : '#334155', 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            fontWeight: 600, 
            cursor: 'pointer',
            fontSize: '15px'
          }}
        >
          📋 Planning Department
        </button>
      </div>

      {/* Conditional Rendering based on selected main menu item */}
      {currentModule === 'operations' ? (
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <h2 style={{ color: '#0f172a', marginBottom: '10px' }}>Operations Control Center</h2>
          <p style={{ color: '#64748b' }}>Standard enterprise operational execution, telemetry, and live feeds.</p>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0, color: '#0f172a' }}>Planning Department & Project Command Hub</h1>
              <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>Enterprise core spine managing multi-domain ERP execution, ledgers, and templates.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setActiveTab('dashboard')} style={{ background: activeTab === 'dashboard' ? '#2563eb' : 'white', color: activeTab === 'dashboard' ? 'white' : '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Dashboard</button>
              <button onClick={() => setActiveTab('projects')} style={{ background: activeTab === 'projects' ? '#2563eb' : 'white', color: activeTab === 'projects' ? 'white' : '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Projects Directory</button>
              <button onClick={() => setActiveTab('templates')} style={{ background: activeTab === 'templates' ? '#2563eb' : 'white', color: activeTab === 'templates' ? 'white' : '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Templates & Forms Studio</button>
              <button onClick={() => setIsCreating(true)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>+ New Project</button>
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Projects Spine</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>{projects.length}</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Active Execution</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2563eb', marginTop: '6px' }}>{projects.filter(p => p.status === 'active').length}</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Draft / Planning</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#d97706', marginTop: '6px' }}>{projects.filter(p => p.status === 'draft').length}</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Completed / Archive</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669', marginTop: '6px' }}>{projects.filter(p => ['completed', 'archived'].includes(p.status)).length}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            <div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Filter Department:</label>
                  <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <option value="all">All Departments</option>
                    <option value="Agriculture">Agriculture</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Logistics">Logistics</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Filter Status:</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', maxHeight: '600px', overflowY: 'auto' }}>
                  <h3 style={{ marginTop: 0 }}>Project Spines ({filteredProjects.length})</h3>
                  {filteredProjects.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => { 
                        setSelectedProject(p); 
                        loadSummary(p.id); 
                        loadBudgetMatrix(p.id);
                      }}
                      style={{ 
                        padding: '12px', 
                        borderBottom: '1px solid #f1f5f9', 
                        cursor: 'pointer',
                        background: selectedProject?.id === p.id ? '#eff6ff' : 'transparent',
                        borderRadius: '6px',
                        marginBottom: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#1d4ed8' }}>{p.code}</strong>
                        <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{p.status}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Dept: {p.department} | Type: {p.project_type}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ marginTop: 0 }}>Project Control & Lifecycle Spine</h3>
                  {selectedProject ? (
                    <div>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 4px 0' }}>{selectedProject.name}</h4>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Code: {selectedProject.code} | Dept: {selectedProject.department}</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{selectedProject.description || 'No description provided.'}</p>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Lifecycle State Actions:</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={() => handleStatusChange(selectedProject.id, 'draft')} style={{ background: '#e2e8f0', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Draft</button>
                          <button onClick={() => handleStatusChange(selectedProject.id, 'active')} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Activate</button>
                          <button onClick={() => handleStatusChange(selectedProject.id, 'suspended')} style={{ background: '#d97706', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Suspend</button>
                          <button onClick={() => handleStatusChange(selectedProject.id, 'completed')} style={{ background: '#059669', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Complete</button>
                          <button onClick={() => handleStatusChange(selectedProject.id, 'archived')} style={{ background: '#475569', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Archive</button>
                        </div>
                      </div>

                      {/* Approval Gateway UI */}
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0' }}>Approval Workflow & Compliance Gate</h4>
                        <p style={{ fontSize: '13px', margin: '0 0 8px 0' }}>
                          Current Approval Status: <strong>{selectedProject.metadata_json?.approval_status || 'Draft / Unsubmitted'}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <select value={approvalRole} onChange={e => setApprovalRole(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                            <option value="CFO">CFO</option>
                            <option value="Director">Project Director</option>
                            <option value="Manager">Operations Manager</option>
                          </select>
                          <input type="text" placeholder="Comments / Rejection Reason..." value={approvalComment} onChange={e => setApprovalComment(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleApprovalAction('request_approval')} style={{ background: '#d97706', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Request Sign-off</button>
                          <button onClick={() => handleApprovalAction('approve')} style={{ background: '#059669', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Approve & Activate</button>
                          <button onClick={() => handleApprovalAction('reject')} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Reject</button>
                        </div>
                      </div>

                      {/* Budget Matrix UI */}
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0' }}>Budget vs. Actual Cost Matrix</h4>
                        {budgetMatrix ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Budget Ceiling</div>
                              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>${budgetMatrix.budget_ceiling.toLocaleString()}</div>
                            </div>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Actual Spent</div>
                              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2563eb' }}>${budgetMatrix.total_actual_spent.toLocaleString()}</div>
                            </div>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Variance</div>
                              <div style={{ fontSize: '16px', fontWeight: 'bold', color: budgetMatrix.variance >= 0 ? '#059669' : '#dc2626' }}>${budgetMatrix.variance.toLocaleString()}</div>
                            </div>
                          </div>
                        ) : (
                          <p>Loading budget matrix...</p>
                        )}
                      </div>

                      {/* Ledger Analytics */}
                      {summary ? (
                        <div>
                          <h4 style={{ margin: '16px 0 8px 0' }}>Linked Ledger Metrics:</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {Object.entries(summary.metrics).map(([domain, count]) => (
                              <div key={domain} style={{ background: '#f1f5f9', padding: '8px', borderRadius: '6px' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'capitalize' }}>{domain.replace('_', ' ')}</div>
                                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p>Loading analytics...</p>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#94a3b8' }}>Select a project from the directory to manage its lifecycle and inspect connected ERP modules.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h2>Custom Project Templates & Dynamic Form Studio</h2>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input type="text" placeholder="Field Key (e.g. supervisor)" value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                <input type="text" placeholder="Default Value" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                <button onClick={handleAddFieldToTemplate} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Add Field</button>
              </div>
            </div>
          )}

          {isCreating && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2>Initialize New Project Spine Wizard</h2>
                <form onSubmit={handleCreateProject}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Select Template:</label>
                    <select onChange={e => handleTemplateChange(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                      {customTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Project Code / SKU</label>
                      <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} required placeholder="PRJ-AGR-001" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Project Name</label>
                      <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Bani Hushaysh Orchard Expansion" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Description</label>
                    <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Template Schema Fields:</label>
                    {Object.entries(customFields).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, width: '140px' }}>{k}:</span>
                        <input type="text" value={v} onChange={e => setCustomFields({ ...customFields, [k]: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setIsCreating(false)} style={{ background: '#64748b', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Create Project Spine</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};