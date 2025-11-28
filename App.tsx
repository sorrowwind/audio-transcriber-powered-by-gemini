import React, { useState, useRef, useEffect } from 'react';
import { useAudioTranscription } from './hooks/useAudioTranscription';
import { AppState, LanguageCode, LANGUAGES } from './types';
import { MicrophoneIcon, StopIcon, CopyIcon, CheckIcon, UploadCloudIcon, PauseIcon, PlayIcon, DownloadIcon, BoldIcon, ItalicIcon, UnderlineIcon } from './components/icons';

const RecordButton: React.FC<{
  appState: AppState;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}> = ({ appState, startRecording, pauseRecording, resumeRecording }) => {
  const getButtonProps = () => {
    switch (appState) {
      case AppState.RECORDING:
        return {
          onClick: pauseRecording,
          'aria-label': 'Pause Recording',
          Icon: PauseIcon,
          className: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400',
          ping: true,
        };
      case AppState.PAUSED:
        return {
          onClick: resumeRecording,
          'aria-label': 'Resume Recording',
          Icon: PlayIcon,
          className: 'bg-green-500 hover:bg-green-600 focus:ring-green-400',
          ping: false,
        };
      case AppState.GETTING_PERMISSION:
        return {
          onClick: () => {},
          'aria-label': 'Starting...',
          Icon: MicrophoneIcon,
          className: 'bg-blue-500',
          ping: true,
        };
      case AppState.STOPPING:
        return {
          onClick: () => {},
          'aria-label': 'Stopping...',
          Icon: StopIcon,
          className: 'bg-slate-400',
          ping: false,
        };
      default: // IDLE
        return {
          onClick: startRecording,
          'aria-label': 'Start Recording',
          Icon: MicrophoneIcon,
          className: 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400',
          ping: false,
        };
    }
  };

  const { onClick, 'aria-label': ariaLabel, Icon, className, ping } = getButtonProps();
  const isDisabled = ![AppState.IDLE, AppState.RECORDING, AppState.PAUSED].includes(appState);
  const isPulsing = appState === AppState.RECORDING || appState === AppState.GETTING_PERMISSION;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`relative flex items-center justify-center w-24 h-24 rounded-full text-white shadow-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
        ${className}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      aria-label={ariaLabel}
    >
      <span className="sr-only">{ariaLabel}</span>
      {ping && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
      <Icon className={`w-10 h-10 ${isPulsing ? 'animate-pulse' : ''}`} />
    </button>
  );
};

const StopButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <button
          onClick={onClick}
          className="flex items-center justify-center w-20 h-20 rounded-full text-white shadow-lg transition-all duration-300 ease-in-out bg-red-500 hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-400"
          aria-label="Stop Recording"
        >
          <StopIcon className="w-8 h-8" />
        </button>
    );
};

const UploadButton: React.FC<{
    appState: AppState;
    onFileSelect: (file: File) => void;
}> = ({ appState, onFileSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isIdle = appState === AppState.IDLE;
    const isTranscribing = appState === AppState.TRANSCRIBING_FILE;
    const isDisabled = !isIdle && !isTranscribing;

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        event.target.value = '';
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="audio/*,.m4a,.opus"
                disabled={!isIdle}
            />
            <button
                onClick={handleButtonClick}
                disabled={isDisabled}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white shadow-md transition-colors duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
                  ${isIdle ? 'bg-slate-600 hover:bg-slate-700 focus:ring-slate-500' : ''}
                  ${isTranscribing ? 'bg-purple-500' : ''}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                 aria-label={isTranscribing ? "Transcribing file..." : "Upload an audio file"}
            >
                {isTranscribing ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Transcribing...</span>
                    </>
                ) : (
                    <>
                        <UploadCloudIcon className="w-6 h-6" />
                        <span>Upload File</span>
                    </>
                )}
            </button>
        </>
    );
};


const NoteEditor: React.FC<{
    noteContent: string;
    liveTranscript: string;
    onNoteChange: (content: string) => void;
    audioBlob: Blob | null;
}> = ({ noteContent, liveTranscript, onNoteChange, audioBlob }) => {
    const [isCopied, setIsCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [editorValue, setEditorValue] = useState('');
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync local state when props change
    useEffect(() => {
        setEditorValue(noteContent + liveTranscript);
    }, [noteContent, liveTranscript]);

    // Cleanup debouncer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    // Autoscroll and cursor positioning logic
    useEffect(() => {
        if (textareaRef.current) {
            const el = textareaRef.current;
            // Only autoscroll and move cursor to the end when live transcription is active
            if (liveTranscript) {
                el.scrollTop = el.scrollHeight;
                el.selectionStart = el.value.length;
                el.selectionEnd = el.value.length;
            }
        }
    }, [editorValue, liveTranscript]);

    const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setEditorValue(value); // Update UI immediately

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            if (liveTranscript && value.endsWith(liveTranscript)) {
                onNoteChange(value.slice(0, -liveTranscript.length));
            } else {
                onNoteChange(value);
            }
        }, 300); // 300ms debounce delay
    };
    
    const handleStyleClick = (style: 'bold' | 'italic' | 'underline') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const markers = {
            bold: '**',
            italic: '*',
            underline: '__'
        };
        const marker = markers[style];
        const { selectionStart, selectionEnd, value } = textarea;
        const selectedText = value.substring(selectionStart, selectionEnd);

        let newValue: string;
        let newSelectionStart: number;
        let newSelectionEnd: number;

        if (selectedText) {
            // Wrap selected text
            newValue = 
                value.substring(0, selectionStart) +
                marker + selectedText + marker +
                value.substring(selectionEnd);
            newSelectionStart = selectionStart;
            newSelectionEnd = selectionEnd + 2 * marker.length;
        } else {
            // Insert markers and place cursor in between
            newValue = 
                value.substring(0, selectionStart) +
                marker + marker +
                value.substring(selectionEnd);
            newSelectionStart = newSelectionEnd = selectionStart + marker.length;
        }

        // Directly manipulate the textarea's value and selection
        textarea.value = newValue;
        textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
        textarea.focus();

        // Dispatch an 'input' event to notify React of the change
        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);
    };

    const handleCopy = async () => {
        if (!editorValue) return;
        try {
            await navigator.clipboard.writeText(editorValue);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy text.');
        }
    };

    const handleDownload = () => {
        if (!audioBlob) return;
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `recording-${timestamp}.wav`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const hasContent = editorValue.trim().length > 0;
    const wordCount = editorValue.trim() ? editorValue.trim().split(/\s+/).length : 0;

    const StyleButton: React.FC<{
        onClick: () => void;
        'aria-label': string;
        children: React.ReactNode;
    }> = ({ onClick, 'aria-label': ariaLabel, children }) => (
        <button
            type="button"
            onClick={onClick}
            className="p-2.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:scale-95"
            aria-label={ariaLabel}
            title={ariaLabel}
        >
            {children}
        </button>
    );

    return (
        <div className="group relative w-full max-w-4xl mx-auto flex flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all duration-300 focus-within:shadow-2xl focus-within:border-indigo-100 focus-within:ring-4 focus-within:ring-indigo-500/5">
            
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-10">
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm">
                    <StyleButton onClick={() => handleStyleClick('bold')} aria-label="Bold">
                        <BoldIcon className="w-5 h-5" />
                    </StyleButton>
                    <StyleButton onClick={() => handleStyleClick('italic')} aria-label="Italic">
                        <ItalicIcon className="w-5 h-5" />
                    </StyleButton>
                    <StyleButton onClick={() => handleStyleClick('underline')} aria-label="Underline">
                        <UnderlineIcon className="w-5 h-5" />
                    </StyleButton>
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                    {audioBlob && (
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20"
                            aria-label="Download recorded audio"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Download Audio</span>
                        </button>
                    )}
                    <button
                        onClick={handleCopy}
                        disabled={!hasContent || isCopied}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20
                            ${isCopied 
                                ? 'bg-green-50 text-green-700' 
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }
                        `}
                        aria-label="Copy text"
                    >
                        {isCopied ? (
                            <>
                                <CheckIcon className="w-4 h-4" />
                                <span>Copied</span>
                            </>
                        ) : (
                            <>
                                <CopyIcon className="w-4 h-4" />
                                <span>Copy Text</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="relative flex-grow bg-white">
                <textarea
                    ref={textareaRef}
                    value={editorValue}
                    onChange={handleEditorChange}
                    className="w-full h-[60vh] p-8 text-lg leading-relaxed text-slate-700 placeholder:text-slate-300 bg-transparent resize-none focus:outline-none font-sans"
                    placeholder="Start speaking to dictate your note, or type here..."
                    aria-label="Note content"
                    spellCheck="false"
                />
            </div>

            {/* Status Bar */}
            <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs font-medium text-slate-400 select-none">
                <div className="flex items-center gap-4">
                    <span>Markdown Supported</span>
                </div>
                <div>
                   {wordCount} words
                </div>
            </div>
        </div>
    );
};


const LanguageSelector: React.FC<{
  currentLanguage: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  disabled: boolean;
}> = ({ currentLanguage, onLanguageChange, disabled }) => {
  return (
    <div className="flex justify-center items-center gap-1 p-1.5 bg-slate-100 rounded-full mb-6 ring-1 ring-slate-900/5">
      {(Object.keys(LANGUAGES) as LanguageCode[]).map((lang) => (
        <button
          key={lang}
          onClick={() => onLanguageChange(lang)}
          disabled={disabled}
          className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20
            ${currentLanguage === lang 
                ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }
            ${disabled ? 'cursor-not-allowed opacity-60' : ''}
          `}
        >
          {LANGUAGES[lang]}
        </button>
      ))}
    </div>
  );
};


const Waveform: React.FC<{
  audioData: Float32Array | null;
  appState: AppState;
}> = ({ audioData, appState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);
  audioDataRef.current = audioData;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    let animationFrameId: number;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    context.scale(dpr, dpr);
    
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const centerY = height / 2;

    const renderFrame = () => {
        const currentAudioData = audioDataRef.current;
        context.clearRect(0, 0, width, height);
        
        // Gradient for the waveform
        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#8b5cf6');
        gradient.addColorStop(1, '#3b82f6');

        context.lineWidth = 2;
        context.strokeStyle = gradient;
        context.lineCap = 'round';
        context.lineJoin = 'round';

        context.beginPath();

        if (appState === AppState.PAUSED) {
            context.moveTo(0, centerY);
            context.lineTo(width, centerY);
        } else if (appState === AppState.RECORDING && currentAudioData && currentAudioData.length > 0) {
            const sliceWidth = width * 1.0 / currentAudioData.length;
            let x = 0;
            for (let i = 0; i < currentAudioData.length; i++) {
                const v = currentAudioData[i];
                // Amplify the signal slightly for visual effect
                const y = (v * height * 1.2) / 2 + centerY;
                if (i === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
                x += sliceWidth;
            }
        } else {
            context.moveTo(0, centerY);
            context.lineTo(width, centerY);
        }
        context.stroke();
    };

    const loop = () => {
        renderFrame();
        animationFrameId = requestAnimationFrame(loop);
    };

    if (appState === AppState.RECORDING || appState === AppState.PAUSED) {
        loop();
    } else {
        renderFrame();
    }

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [appState]);

  return (
    <div className="w-full h-32 bg-slate-50/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full"></canvas>
    </div>
  );
};


export default function App() {
  const [language, setLanguage] = useState<LanguageCode>('ru');
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const { 
    appState, 
    transcript, 
    liveTranscript, 
    error, 
    recordingTime, 
    audioBlob, 
    startRecording, 
    stopRecording, 
    transcribeFile, 
    pauseRecording, 
    resumeRecording 
  } = useAudioTranscription({ 
    language,
    onAudioData: setAudioData,
  });
  
  const [noteContent, setNoteContent] = useState('');
  const lastProcessedTranscriptLength = useRef(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Capture the PWA install prompt event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
      });
    }
  };

  useEffect(() => {
    if (transcript.length > lastProcessedTranscriptLength.current) {
        const newPart = transcript.substring(lastProcessedTranscriptLength.current);
        setNoteContent(prev => prev + newPart);
        lastProcessedTranscriptLength.current = transcript.length;
    } else if (transcript.length < lastProcessedTranscriptLength.current) {
        // This case handles transcription resets (e.g. from file upload)
        setNoteContent(transcript);
        lastProcessedTranscriptLength.current = transcript.length;
    }
  }, [transcript]);

  const handleStartRecording = () => {
    setNoteContent('');
    lastProcessedTranscriptLength.current = 0;
    startRecording();
  };

  const handleFileSelect = (file: File) => {
    setNoteContent('');
    lastProcessedTranscriptLength.current = 0;
    transcribeFile(file);
  };
  
  // Check for shared file on mount
  useEffect(() => {
      const checkSharedFile = async () => {
          if (!('indexedDB' in window)) return;
          
          try {
              const openRequest = indexedDB.open('transcriber-share-db', 1);
              
              openRequest.onupgradeneeded = (e: any) => {
                  const db = e.target.result;
                  if (!db.objectStoreNames.contains('shared-files')) {
                      db.createObjectStore('shared-files');
                  }
              };

              openRequest.onsuccess = (e: any) => {
                  const db = e.target.result;
                  if (!db.objectStoreNames.contains('shared-files')) return;

                  const transaction = db.transaction(['shared-files'], 'readwrite');
                  const store = transaction.objectStore('shared-files');
                  const getRequest = store.get('latest');

                  getRequest.onsuccess = () => {
                      const file = getRequest.result;
                      if (file instanceof File) {
                          setNoteContent('');
                          lastProcessedTranscriptLength.current = 0;
                          transcribeFile(file);
                          store.delete('latest');
                      }
                  };
              };
          } catch (error) {
              console.error('Error checking for shared file:', error);
          }
      };
      
      checkSharedFile();
  }, [transcribeFile]);


  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const isAppBusy = appState !== AppState.IDLE;
  const isRecordingOrPaused = appState === AppState.RECORDING || appState === AppState.PAUSED;
  
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (isAppBusy) return;

        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file) {
                handleFileSelect(file);
            }
            e.dataTransfer.clearData();
        }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
    };
}, [isAppBusy, transcribeFile]);
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const getStatusText = () => {
      switch (appState) {
          case AppState.GETTING_PERMISSION:
              return "Requesting microphone access...";
          case AppState.RECORDING:
              return `Recording... ${formatTime(recordingTime)}`;
          case AppState.PAUSED:
              return `Paused... ${formatTime(recordingTime)}`;
          case AppState.STOPPING:
              return "Processing final audio...";
          case AppState.TRANSCRIBING_FILE:
              return "Transcribing your audio file...";
          default:
              return "Click the microphone to start dictating or upload an audio file.";
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center font-sans p-6 text-center bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="mb-10 mt-4 relative w-full flex justify-center">
        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="absolute right-0 top-0 hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium shadow-md hover:bg-slate-800 transition-colors animate-fade-in"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Install App
          </button>
        )}
        <div className="flex flex-col items-center">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Audio Transcriber
            </h1>
            <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-slate-500 font-medium">powered by</span>
                <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent font-bold text-lg">Gemini</span>
            </div>
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="mt-4 sm:hidden flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium shadow-md hover:bg-slate-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Install App
              </button>
            )}
        </div>
      </header>

      <main className="w-full flex-grow flex flex-col items-center gap-10 pb-12">
        <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <LanguageSelector
                currentLanguage={language}
                onLanguageChange={setLanguage}
                disabled={isAppBusy}
            />
            
            <div className="relative flex items-center justify-center w-full">
                 {/* Decorative background blur */}
                 <div className="absolute inset-0 bg-gradient-to-tr from-blue-200/40 to-purple-200/40 rounded-full blur-3xl opacity-50 scale-75"></div>
                 
                 <div className="relative flex items-center justify-center gap-8 h-28">
                    <RecordButton 
                        appState={appState}
                        startRecording={handleStartRecording}
                        pauseRecording={pauseRecording}
                        resumeRecording={resumeRecording}
                    />
                    {isRecordingOrPaused ? (
                        <StopButton onClick={stopRecording} />
                    ) : (
                        appState === AppState.IDLE && (
                            <>
                                <span className="text-slate-400 font-medium text-lg">OR</span>
                                <UploadButton 
                                    appState={appState}
                                    onFileSelect={handleFileSelect}
                                />
                            </>
                        )
                    )}
                </div>
            </div>
            
            <p className="text-slate-500 font-medium h-6 animate-fade-in transition-all">
                {getStatusText()}
            </p>
        </div>

        {isRecordingOrPaused && (
            <div className="w-full max-w-2xl animate-fade-in-up">
                <Waveform appState={appState} audioData={audioData} />
            </div>
        )}

        {error && (
            <div className="w-full max-w-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm flex items-start gap-3" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-left">
                    <strong className="font-bold block">Error</strong>
                    <span className="block text-sm">{error}</span>
                </div>
            </div>
        )}
        
        <div className="relative w-full max-w-4xl mx-auto mt-2 px-2 sm:px-0">
            {isDragging && !isAppBusy && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-md border-4 border-dashed border-indigo-400 rounded-2xl shadow-2xl transition-all duration-300">
                    <div className="p-4 bg-indigo-50 rounded-full mb-4">
                        <UploadCloudIcon className="w-12 h-12 text-indigo-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-800">Drop audio file here</p>
                    <p className="text-slate-500 mt-1">MP3, WAV, M4A, OGG supported</p>
                </div>
            )}
            <NoteEditor 
                noteContent={noteContent}
                liveTranscript={liveTranscript}
                onNoteChange={setNoteContent}
                audioBlob={audioBlob} 
            />
        </div>

      </main>

      <footer className="text-slate-400 text-sm pb-6">
        <p>© 2025 Gemini Audio Transcriber. Built for demonstration.</p>
      </footer>
    </div>
  );
}