import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useAuth } from '../context/AuthContext';
import { loadWorkflowsFromDB } from '../db';
import type { SavedWorkflow } from '../types';
import './WorkflowManager.css';

export function WorkflowManager() {
  const {
    workflows, setWorkflows, saveCurrentWorkflow, loadWorkflowState,
    renameWorkflow, deleteWorkflow, exportWorkflowFile, importWorkflowFile,
    clearCurrentSession,
  } = useStore();
  const { currentUser } = useAuth();
  const isMaster = currentUser?.role === 'master';

  const [showDropdown, setShowDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [workflowNameInput, setWorkflowNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingWfId, setIsLoadingWfId] = useState<string | null>(null);

  // Overwrite confirmation modal state
  const [overwriteTarget, setOverwriteTarget] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<SavedWorkflow | null>(null);

  // Inline rename state in list modal
  const [editingWfId, setEditingWfId] = useState<string | null>(null);
  const [editingWfName, setEditingWfName] = useState('');

  // Status notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved workflows on mount with data-layer operator isolation
  useEffect(() => {
    loadWorkflowsFromDB(currentUser).then(list => {
      setWorkflows(list || []);
    }).catch(console.error);
  }, [setWorkflows, currentUser]);

  // Re-fetch fresh workflows from Supabase whenever Saved Workflows modal is opened
  useEffect(() => {
    if (showListModal && currentUser) {
      loadWorkflowsFromDB(currentUser).then(list => {
        setWorkflows(list || []);
      }).catch(console.error);
    }
  }, [showListModal, currentUser, setWorkflows]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleNewWorkflow = async () => {
    setShowDropdown(false);
    if (!window.confirm('Create new blank workflow?\nAny unsaved changes in your current workflow will be discarded.')) return;
    await clearCurrentSession();
    showToast('Created new blank workflow.');
  };

  const handleCloseWorkflow = async () => {
    setShowDropdown(false);
    if (!window.confirm('Close current workflow?\nAny unsaved changes in your current workflow will be discarded.')) return;
    await clearCurrentSession();
    showToast('Workflow closed.');
  };

  const handleOpenSaveModal = () => {
    setShowDropdown(false);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    setWorkflowNameInput(`Workflow - ${dateStr}`);
    setShowSaveModal(true);
  };

  const handleConfirmSave = async () => {
    const name = workflowNameInput.trim();
    if (!name) return;

    // Check if workflow with this name already exists for current operator
    const exists = visibleWorkflows.some(w => w.name.toLowerCase() === name.toLowerCase());
    if (exists && !overwriteTarget) {
      setOverwriteTarget(name);
      return;
    }

    setIsSaving(true);
    try {
      await saveCurrentWorkflow(name);
      showToast(`Workflow "${name}" saved successfully!`);
      setShowSaveModal(false);
      setOverwriteTarget(null);
    } catch (err: any) {
      showToast(`Failed to save workflow: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadWorkflow = async (wf: SavedWorkflow) => {
    const canModify = isMaster || wf.username === currentUser?.username;
    if (!canModify) {
      showToast('Unauthorized: You do not have permission to load this workflow.');
      return;
    }
    if (!window.confirm(`Load workflow "${wf.name}"?\nThis will replace your current session state.`)) return;
    setIsLoadingWfId(wf.id);
    try {
      await loadWorkflowState(wf);
      showToast(`Workflow "${wf.name}" loaded successfully!`);
      setShowListModal(false);
    } catch (err: any) {
      showToast(`Failed to load workflow: ${err.message}`);
    } finally {
      setIsLoadingWfId(null);
    }
  };

  const handleConfirmDelete = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteWorkflow(target.id);
      showToast(`Workflow "${target.name}" deleted.`);
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Delete workflow error:', err);
      showToast(`Failed to delete: ${err.message}`);
    }
  };

  const handleStartRename = (wf: SavedWorkflow) => {
    const canModify = isMaster || wf.username === currentUser?.username;
    if (!canModify) {
      showToast('Unauthorized: You do not have permission to rename this workflow.');
      return;
    }
    setEditingWfId(wf.id);
    setEditingWfName(wf.name);
  };

  const handleFinishRename = async (wfId: string) => {
    const newName = editingWfName.trim();
    if (newName && newName !== workflows.find(w => w.id === wfId)?.name) {
      await renameWorkflow(wfId, newName);
      showToast(`Workflow renamed to "${newName}".`);
    }
    setEditingWfId(null);
  };

  const handleExport = (wf: SavedWorkflow) => {
    exportWorkflowFile(wf);
    showToast(`Exported "${wf.name}" to file.`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importWorkflowFile(file);
      showToast(`Imported workflow "${imported.name}" successfully!`);
      e.target.value = '';
      setShowListModal(true);
    } catch (err: any) {
      showToast(`Import error: ${err.message}`);
    }
  };

  const visibleWorkflows = isMaster
    ? workflows
    : workflows.filter(w => w.username === currentUser?.username);

  const countTotals = (wf: SavedWorkflow) => {
    const decks = wf.state?.decks || [];
    const deckCount = decks.length;
    const slideCount = decks.reduce((sum, d) => sum + (d.slides || []).length, 0);
    const audioCount = (wf.state?.audioTracks || []).length;
    const photoCount = (wf.state?.photos || []).length;
    const videoCount = (wf.state?.videos || []).length;
    return { deckCount, slideCount, audioCount, photoCount, videoCount };
  };

  return (
    <div className="workflow-manager-root" ref={dropdownRef}>
      <button className="workflow-btn" onClick={() => setShowDropdown(!showDropdown)}>
        Workflow <span className="arrow-down">▼</span>
      </button>

      {showDropdown && (
        <div className="workflow-dropdown-menu">
          <div className="wf-dropdown-item" onClick={handleNewWorkflow}>
            <span>New Workflow</span>
          </div>
          <div className="wf-dropdown-item" onClick={handleOpenSaveModal}>
            <span>Save Current Workflow</span>
          </div>
          <div className="wf-dropdown-item" onClick={() => { setShowDropdown(false); setShowListModal(true); }}>
            <span>View Saved Workflows ({visibleWorkflows.length})</span>
          </div>
          <div className="wf-dropdown-divider" />
          <div className="wf-dropdown-item" onClick={handleCloseWorkflow}>
            <span>Close Workflow</span>
          </div>
          <div className="wf-dropdown-divider" />
          <div className="wf-dropdown-item" onClick={() => { setShowDropdown(false); fileInputRef.current?.click(); }}>
            <span>Import Workflow File...</span>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".json,.presentdeck"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="wf-toast">
          <span>✨ {toastMessage}</span>
        </div>
      )}

      {/* Save Workflow Modal */}
      {showSaveModal && createPortal(
        <div className="wf-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="wf-modal glass-panel" onClick={e => e.stopPropagation()}>
            <div className="wf-modal-header">
              <h3>💾 Save Workflow</h3>
              <button className="wf-close-btn" onClick={() => setShowSaveModal(false)}>✕</button>
            </div>
            <div className="wf-modal-body">
              <p className="wf-modal-desc">
                Save a snapshot of your current session state (PPT decks, slide order, starred slides, audio tracks, photos, videos, and live state).
              </p>
              <label className="wf-field-label">Workflow Name</label>
              <input
                type="text"
                className="wf-input"
                value={workflowNameInput}
                onChange={e => setWorkflowNameInput(e.target.value)}
                placeholder="e.g. Sunday Morning Service"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmSave(); }}
              />

              {overwriteTarget && (
                <div className="wf-alert-warning">
                  ⚠️ Workflow "<strong>{overwriteTarget}</strong>" already exists. Click Save again to overwrite it.
                </div>
              )}
            </div>
            <div className="wf-modal-footer">
              <button className="wf-btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="wf-btn-primary" onClick={handleConfirmSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : overwriteTarget ? 'Overwrite & Save' : 'Save Workflow'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Saved Workflows List Modal */}
      {showListModal && createPortal(
        <div className="wf-modal-overlay" onClick={() => setShowListModal(false)}>
          <div className="wf-modal wf-modal-lg glass-panel" onClick={e => e.stopPropagation()}>
            <div className="wf-modal-header">
              <h3>📂 Saved Workflows ({visibleWorkflows.length})</h3>
              <div className="wf-header-actions">
                <button className="wf-btn-sm" onClick={() => fileInputRef.current?.click()}>
                  📥 Import File
                </button>
                <button className="wf-close-btn" onClick={() => setShowListModal(false)}>✕</button>
              </div>
            </div>

            <div className="wf-modal-body wf-list-body">
              {visibleWorkflows.length === 0 ? (
                <div className="wf-empty-state">
                  <span className="wf-empty-icon">📂</span>
                  <p>No saved workflows available.</p>
                  <button className="wf-btn-primary" onClick={handleOpenSaveModal}>
                    💾 Save Current Workflow
                  </button>
                </div>
              ) : (
                <div className="wf-card-grid">
                  {visibleWorkflows.map(wf => {
                    const counts = countTotals(wf);
                    const isEditing = editingWfId === wf.id;
                    const dateStr = new Date(wf.savedAt).toLocaleString();
                    const canModify = isMaster || wf.username === currentUser?.username;

                    return (
                      <div key={wf.id} className="wf-card">
                        <div className="wf-card-top">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            {isEditing ? (
                              <input
                                type="text"
                                className="wf-rename-input"
                                value={editingWfName}
                                onChange={e => setEditingWfName(e.target.value)}
                                onBlur={() => handleFinishRename(wf.id)}
                                onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(wf.id); }}
                                autoFocus
                              />
                            ) : (
                              <h4 className="wf-card-title" onDoubleClick={() => handleStartRename(wf)} style={{ cursor: canModify ? 'pointer' : 'default' }}>
                                {wf.name}
                              </h4>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span className={`wf-owner-tag ${wf.username === 'Kunal' ? 'master-tag' : 'operator-tag'}`}>
                                {wf.username === 'Kunal' ? '👑 Saved by: Kunal (Master)' : (wf.username ? `👤 Saved by: ${wf.username}` : '📂 Saved by: Legacy')}
                              </span>
                              <span className="wf-card-date">{dateStr}</span>
                            </div>
                          </div>
                        </div>

                        <div className="wf-card-badges">
                          <span className="wf-badge">📊 {counts.deckCount} Decks ({counts.slideCount} slides)</span>
                          {counts.audioCount > 0 && <span className="wf-badge">🎵 {counts.audioCount} Audio</span>}
                          {counts.photoCount > 0 && <span className="wf-badge">🖼️ {counts.photoCount} Photos</span>}
                          {counts.videoCount > 0 && <span className="wf-badge">🎬 {counts.videoCount} Videos</span>}
                        </div>

                        <div className="wf-card-actions">
                          <button
                            className="wf-act-btn wf-act-load"
                            onClick={() => handleLoadWorkflow(wf)}
                            disabled={isLoadingWfId === wf.id || !canModify}
                            style={!canModify ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                            title={!canModify ? "Permission required to load workflow" : "Load state"}
                          >
                            {isLoadingWfId === wf.id ? 'Loading...' : !canModify ? '🔒 Load' : '📥 Load'}
                          </button>
                          <button
                            className="wf-act-btn wf-act-export"
                            onClick={() => handleExport(wf)}
                            title="Export shareable .json file"
                          >
                            📤 Send / Export
                          </button>
                          <button
                            className="wf-act-btn"
                            onClick={() => handleStartRename(wf)}
                            disabled={!canModify}
                            style={!canModify ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                            title={!canModify ? "Permission required to rename workflow" : "Rename"}
                          >
                            {!canModify ? '🔒 Rename' : '✏️ Rename'}
                          </button>
                          {canModify ? (
                            <button
                              className="wf-act-btn wf-act-delete"
                              onClick={() => setDeleteTarget(wf)}
                              title="Delete workflow"
                            >
                              🗑️ Delete
                            </button>
                          ) : (
                            <button
                              className="wf-act-btn wf-act-delete"
                              disabled
                              style={{ opacity: 0.45, cursor: 'not-allowed' }}
                              title="Permission required to delete workflow"
                            >
                              🔒 Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && createPortal(
        <div className="wf-modal-overlay wf-modal-overlay-confirm" onClick={() => setDeleteTarget(null)}>
          <div className="wf-modal wf-modal-sm glass-panel" onClick={e => e.stopPropagation()}>
            <div className="wf-modal-header">
              <h3>⚠️ Delete Workflow</h3>
              <button className="wf-close-btn" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="wf-modal-body">
              <p className="wf-modal-desc">
                Are you sure you want to delete workflow "<strong>{deleteTarget.name}</strong>"? This action cannot be undone.
              </p>
            </div>
            <div className="wf-modal-footer">
              <button className="wf-btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="wf-btn-danger" onClick={handleConfirmDelete}>Confirm Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
