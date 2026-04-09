
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Project, Soundtrack } from '../types';
import AudioVisualizer from './AudioVisualizer';
import { Capacitor } from '@capacitor/core';

// Fallback UUID generator for older browsers
const generateId = () => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const DB_NAME = 'VocalFlow_V3';
const STORE_NAME = 'tracks_data';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = async (id: string, blob: Blob) => {
  const db = await getDB();
  const arrayBuffer = await blob.arrayBuffer();
  return new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ data: arrayBuffer, type: blob.type }, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
};

const getFromDB = async (id: string): Promise<Blob | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) {
          const { data, type } = request.result;
          resolve(new Blob([data], { type }));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
};

const removeFromDB = async (id: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
};

interface ProjectViewProps {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
}

const ProjectView: React.FC<ProjectViewProps> = ({ project, onBack, onUpdate }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [audioUrlMap, setAudioUrlMap] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const loadUrls = useCallback(async () => {
    const newMap: Record<string, string> = { ...audioUrlMap };
    let changed = false;
    for (const track of project.tracks) {
      if (!newMap[track.id]) {
        try {
          const blob = await getFromDB(track.id);
          if (blob) {
            newMap[track.id] = URL.createObjectURL(blob);
            changed = true;
          }
        } catch (e) {
          console.error("Load track error:", e);
        }
      }
    }
    if (changed) setAudioUrlMap(newMap);
  }, [project.tracks, audioUrlMap]);

  useEffect(() => { loadUrls(); }, [project.tracks.length]);

  // --- MediaSession Integration ---
  const activeIndexRef = useRef(activeIndex);
  const projectRefForMedia = useRef(project);
  
  useEffect(() => {
    activeIndexRef.current = activeIndex;
    projectRefForMedia.current = project;
  }, [activeIndex, project]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const playHandler = async () => {
      try {
        if (playerRef.current) {
          await playerRef.current.play();
        }
      } catch (err) {
        console.error("MediaSession Play Error:", err);
      }
    };

    const pauseHandler = () => {
      playerRef.current?.pause();
    };

    const prevHandler = () => {
      if (activeIndexRef.current > 0) {
        setActiveIndex(activeIndexRef.current - 1);
        setIsPlaying(false);
      }
    };

    const nextHandler = () => {
      if (activeIndexRef.current < projectRefForMedia.current.tracks.length - 1) {
        setActiveIndex(activeIndexRef.current + 1);
        setIsPlaying(false);
      }
    };

    navigator.mediaSession.setActionHandler('play', playHandler);
    navigator.mediaSession.setActionHandler('pause', pauseHandler);
    navigator.mediaSession.setActionHandler('previoustrack', prevHandler);
    navigator.mediaSession.setActionHandler('nexttrack', nextHandler);
    
    // iOS often requires 'stop' handler to maintain session state correctly
    try {
      navigator.mediaSession.setActionHandler('stop', () => {
        playerRef.current?.pause();
        if (playerRef.current) playerRef.current.currentTime = 0;
      });
    } catch (e) {}

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('stop', null);
      }
    };
  }, []);

  // Update metadata separately to avoid re-registering handlers
  useEffect(() => {
    if ('mediaSession' in navigator) {
      const track = project.tracks[activeIndex];
      if (track) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.label,
          artist: project.name,
          album: 'VocalFlow Project',
          artwork: [
            { src: 'https://cdn-icons-png.flaticon.com/512/5988/5988544.png', sizes: '512x512', type: 'image/png' }
          ]
        });
      }
    }
  }, [activeIndex, project.name, project.tracks.length]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const currentUrl = project.tracks[activeIndex] ? audioUrlMap[project.tracks[activeIndex].id] : '';

  // iOS Fix: Explicitly load audio when source changes to ensure it's ready for MediaSession
  useEffect(() => {
    if (playerRef.current && currentUrl) {
      playerRef.current.load();
    }
  }, [currentUrl]);

  const startRecording = async () => {
    if (isProcessing) return;
    try {
      setIsProcessing(true);

      // Check getUserMedia availability
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Audio recording is not supported on this device.');
        setIsProcessing(false);
        return;
      }

      // Retry up to 3 times — audio source can be briefly busy on Android
      let stream: MediaStream | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          break;
        } catch (e: any) {
          lastErr = e;
          if (e?.name === 'NotReadableError' && attempt < 2) {
            await new Promise(r => setTimeout(r, 800));
          } else {
            throw e;
          }
        }
      }
      if (!stream) throw lastErr;
      streamRef.current = stream!;

      const recorder = new MediaRecorder(stream!);
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsProcessing(true);
        const chunks = audioChunksRef.current;
        if (chunks.length > 0) {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const trackId = generateId();
            await saveToDB(trackId, blob);

            const latest = projectRef.current;
            const newTrack: Soundtrack = {
              id: trackId,
              url: '',
              createdAt: Date.now(),
              duration: 0,
              label: `Soundtrack ${latest.tracks.length + 1}`
            };

            onUpdate({ ...latest, tracks: [...latest.tracks, newTrack] });
            setActiveIndex(latest.tracks.length);
          } catch (err) {
            console.error("Save process error:", err);
          }
        }
        setIsProcessing(false);
        mediaRecorderRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
    } catch (err: any) {
      console.error("Mic error:", err?.name, err?.message);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        alert('Microphone permission denied.\n\nPlease:\n1. Go to Settings → Apps → VocalFlow → Permissions\n2. Enable Microphone\n3. Close & reopen VocalFlow');
      } else {
        alert(`Could not start recording: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleDownload = async (track: Soundtrack, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const blob = await getFromDB(track.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}-${track.label}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert("Failed to export audio.");
    }
  };

  const handleDeleteTrack = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (confirmDeleteId !== trackId) {
      setConfirmDeleteId(trackId);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    try {
      await removeFromDB(trackId);
      
      if (audioUrlMap[trackId]) {
        URL.revokeObjectURL(audioUrlMap[trackId]);
        setAudioUrlMap(prev => {
          const newMap = { ...prev };
          delete newMap[trackId];
          return newMap;
        });
      }

      const updatedTracks = project.tracks.filter(t => t.id !== trackId);
      
      if (activeIndex >= updatedTracks.length) {
        setActiveIndex(Math.max(0, updatedTracks.length - 1));
      }
      
      setIsPlaying(false);
      setConfirmDeleteId(null);
      onUpdate({ ...project, tracks: updatedTracks });
    } catch (err) {
      console.error("Delete track error:", err);
      alert("Failed to delete track.");
    }
  };

  const handlePlayAction = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (!currentUrl || !playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play().catch(console.error);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (activeIndex < project.tracks.length - 1) {
      setActiveIndex(prev => prev + 1);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12" onClick={() => setConfirmDeleteId(null)}>
      {isFocusMode && (
        <div 
          onClick={() => handlePlayAction()}
          className="fixed inset-0 z-50 bg-slate-950 flex flex-col p-4 cursor-pointer select-none overflow-hidden"
        >
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsFocusMode(false); }}
            className="absolute top-4 right-4 p-3 bg-slate-800/80 hover:bg-slate-700 rounded-full text-white z-[70] shadow-lg active:scale-90 transition-transform"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div className="flex flex-col items-center justify-center mt-10 mb-2 shrink-0">
            <p className="text-indigo-400 text-[8px] font-bold tracking-[0.4em] uppercase mb-0.5 opacity-60">Focus Playback</p>
            <h3 className="text-lg font-black text-white truncate max-w-full px-10 text-center">{project.tracks[activeIndex]?.label || "No Track Selected"}</h3>
            <p className="text-slate-600 mt-0.5 text-[10px] font-medium uppercase tracking-widest">Track {activeIndex + 1} of {project.tracks.length}</p>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="relative flex items-center justify-center w-full max-w-[500px] aspect-square">
              <div className={`absolute inset-0 bg-indigo-500 rounded-full blur-[80px] opacity-10 transition-all duration-1000 ${isPlaying ? 'scale-125' : 'scale-90'}`} />
              <button 
                type="button"
                onClick={(e) => handlePlayAction(e)}
                disabled={!currentUrl}
                className={`relative w-full h-full rounded-[100px] flex items-center justify-center transition-all active:scale-[0.98] shadow-2xl border-[6px] ${
                  isPlaying ? 'bg-indigo-600 text-white border-indigo-400/30 shadow-indigo-500/40' : 'bg-white text-indigo-600 border-white shadow-white/10'
                }`}
              >
                {isPlaying ? (
                  <svg className="w-1/2 h-1/2" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg className="w-1/2 h-1/2 translate-x-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-10 justify-center items-center py-8 shrink-0 z-[65]">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex(prev => Math.max(0, prev - 1)); setIsPlaying(false); }}
              disabled={activeIndex === 0}
              className="p-6 bg-slate-900/60 backdrop-blur-md rounded-[40px] text-slate-400 disabled:opacity-5 active:scale-90 transition-transform shadow-xl border border-white/5"
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z" /></svg>
            </button>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex(prev => Math.min(project.tracks.length - 1, prev + 1)); setIsPlaying(false); }}
              disabled={activeIndex === project.tracks.length - 1}
              className="p-6 bg-slate-900/60 backdrop-blur-md rounded-[40px] text-slate-400 disabled:opacity-5 active:scale-90 transition-transform shadow-xl border border-white/5"
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-2">
        <button type="button" onClick={onBack} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="text-xl font-bold truncate max-w-[200px]">{project.name}</h2>
        <div className="w-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 space-y-4">
          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl flex flex-col items-center">
            <AudioVisualizer stream={streamRef.current} isRecording={isRecording} />
            <div className="mt-6 w-full">
              <button 
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all ${
                  isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white'
                } disabled:opacity-50`}
              >
                {isProcessing ? "SAVING..." : isRecording ? "STOP RECORDING" : "START RECORDING"}
              </button>
            </div>
          </div>

          {project.tracks.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-6 text-white shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] opacity-70 font-bold uppercase mb-1">Selected</p>
                  <p className="font-bold truncate text-lg leading-tight">{project.tracks[activeIndex]?.label}</p>
                </div>
                <div className="flex gap-2 ml-2">
                  <button type="button" onClick={(e) => handleDownload(project.tracks[activeIndex], e)} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors" title="Download">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button type="button" onClick={() => setIsFocusMode(true)} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors" title="Focus Mode">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center bg-black/20 p-4 rounded-2xl">
                <button type="button" onClick={(e) => { e.stopPropagation(); setActiveIndex(prev => Math.max(0, prev - 1)); setIsPlaying(false); }} disabled={activeIndex === 0} className="p-2 disabled:opacity-30"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z" /></svg></button>
                <button type="button" onClick={(e) => handlePlayAction(e)} disabled={!currentUrl || isProcessing} className="w-14 h-14 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                  {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-8 h-8 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setActiveIndex(prev => Math.min(project.tracks.length - 1, prev + 1)); setIsPlaying(false); }} disabled={activeIndex === project.tracks.length - 1} className="p-2 disabled:opacity-30"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg></button>
              </div>
              <audio 
                ref={playerRef} 
                src={currentUrl} 
                onEnded={handleEnded} 
                onPlay={() => setIsPlaying(true)} 
                onPause={() => setIsPlaying(false)} 
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
                preload="auto"
              />
            </div>
          )}
        </div>

        <div className="md:col-span-8">
          <div className="bg-slate-900/80 rounded-3xl border border-slate-800 flex flex-col h-[600px] overflow-hidden shadow-inner">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/40 backdrop-blur-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Playlist</h3>
              <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold">{project.tracks.length} TRACKS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {project.tracks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50"><p className="text-sm font-medium italic">Record first track</p></div>
              ) : (
                project.tracks.map((track, idx) => {
                  const isSelected = activeIndex === idx;
                  const isConfirming = confirmDeleteId === track.id;
                  
                  return (
                    <div 
                      key={track.id} 
                      onClick={() => { setActiveIndex(idx); setIsPlaying(false); setConfirmDeleteId(null); }} 
                      className={`group flex items-center gap-4 p-4 rounded-2xl cursor-pointer border transition-all ${isSelected ? 'bg-indigo-600/10 border-indigo-500/40 shadow-sm' : 'bg-slate-800/30 border-transparent hover:bg-slate-800/50'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-600'}`}>{String(idx + 1).padStart(2, '0')}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold truncate text-sm ${isSelected ? 'text-white' : 'text-slate-400'}`}>{track.label}</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">{new Date(track.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          type="button"
                          onClick={(e) => handleDownload(track, e)}
                          className={`p-2 rounded-lg transition-colors ${isSelected ? 'text-indigo-400 hover:bg-indigo-400/10' : 'text-slate-600 hover:text-slate-400 hover:bg-slate-700'}`}
                          title="Download"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => handleDeleteTrack(track.id, e)}
                          className={`px-2 py-2 rounded-lg transition-all relative z-20 flex items-center gap-1 font-bold text-[10px] ${
                            isConfirming 
                              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20 px-3' 
                              : isSelected ? 'text-red-400 hover:bg-red-400/20' : 'text-slate-600 hover:text-red-400 hover:bg-slate-700'
                          }`}
                          title={isConfirming ? "Confirm Delete?" : "Delete Track"}
                        >
                          {isConfirming && <span>SURE?</span>}
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectView;
