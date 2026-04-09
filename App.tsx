
import React, { useState, useEffect, useCallback } from 'react';
import { Project } from './types';
import ProjectList from './components/ProjectList';
import ProjectView from './components/ProjectView';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('vocalflow_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('vocalflow_projects', JSON.stringify(projects));
  }, [projects]);

  // PWA Install Logic
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          const registration = await navigator.serviceWorker.register('./sw.js', {
            scope: './'
          });
          console.log('SW Registered successfully:', registration.scope);
        } catch (err) {
          console.warn('Service Worker registration skipped:', err);
        }
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
        return () => window.removeEventListener('load', registerSW);
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleCreateProject = (name: string) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      description: 'Newly created project',
      createdAt: Date.now(),
      tracks: []
    };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const updateProject = useCallback((updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? { ...updated } : p));
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            VocalFlow
          </h1>
        </div>

        {installPrompt && (
          <button 
            onClick={handleInstallClick}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-full text-xs font-bold hover:bg-indigo-600/30 transition-all animate-pulse"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            INSTALL APP
          </button>
        )}
      </header>

      <main className="w-full max-w-4xl flex-1">
        {activeProject ? (
          <ProjectView 
            key={activeProject.id}
            project={activeProject} 
            onBack={() => setActiveProjectId(null)} 
            onUpdate={updateProject}
          />
        ) : (
          <ProjectList 
            projects={projects} 
            onCreate={handleCreateProject} 
            onDelete={handleDeleteProject}
            onSelect={setActiveProjectId}
          />
        )}
      </main>

      <footer className="mt-auto pt-8 pb-4 text-slate-600 text-[10px] text-center uppercase tracking-widest">
        Professional Audio Studio &bull; Offline Ready
      </footer>
    </div>
  );
};

export default App;
