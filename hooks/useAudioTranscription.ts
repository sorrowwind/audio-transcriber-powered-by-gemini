import { useState, useRef, useCallback, useEffect } from 'react';
// FIX: Remove `LiveSession` from import as it's not exported. Import `Blob` as `GoogleGenAIBlob` for type safety.
import { GoogleGenAI, Modality, LiveServerMessage, Blob as GoogleGenAIBlob } from '@google/genai';
import { AppState, LanguageCode, SYSTEM_INSTRUCTIONS } from '../types';
import { createBlob, fileToBase64, encodeWav, decode, decodeAudioData } from '../utils/audio';

// FIX: Since LiveSession is not exported from @google/genai, we define a minimal interface for it.
interface LiveSession {
  sendRealtimeInput(input: { media: GoogleGenAIBlob }): void;
  close(): void;
}

export const useAudioTranscription = ({ language, onAudioData }: { language: LanguageCode, onAudioData?: (data: Float32Array) => void }) => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [transcript, setTranscript] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingTime(prevTime => prevTime + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const pauseRecording = useCallback(() => {
    if (appState !== AppState.RECORDING) return;
    setAppState(AppState.PAUSED);
    scriptProcessorRef.current?.disconnect();
    stopTimer();
    onAudioData?.(new Float32Array(0));
  }, [appState, onAudioData]);

  const resumeRecording = useCallback(() => {
    if (appState !== AppState.PAUSED) return;
    setAppState(AppState.RECORDING);
    if (scriptProcessorRef.current && mediaStreamSourceRef.current && audioContextRef.current) {
        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
        scriptProcessorRef.current.connect(audioContextRef.current.destination);
    }
    startTimer();
  }, [appState]);

  const stopRecording = useCallback(async () => {
    if ([AppState.IDLE, AppState.STOPPING].includes(appState)) return;
    setAppState(AppState.STOPPING);
    stopTimer();
    onAudioData?.(new Float32Array(0));

    try {
      if (recordedChunksRef.current.length > 0) {
        const totalLength = recordedChunksRef.current.reduce((acc, val) => acc + val.length, 0);
        const concatenated = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of recordedChunksRef.current) {
          concatenated.set(chunk, offset);
          offset += chunk.length;
        }
        
        const sampleRate = audioContextRef.current?.sampleRate || 16000;
        const wavBlob = encodeWav(concatenated, sampleRate);
        setAudioBlob(wavBlob);
        recordedChunksRef.current = [];
      }
        
      if (sessionPromiseRef.current) {
        const session = await sessionPromiseRef.current;
        session.close();
        sessionPromiseRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        await outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
      }
    } catch (e) {
      console.error("Error stopping recording:", e);
      setError("Failed to stop recording cleanly.");
    } finally {
      if (liveTranscriptRef.current) {
          setTranscript(prev => prev + liveTranscriptRef.current + '\n\n');
          liveTranscriptRef.current = '';
          setLiveTranscript('');
      }
      setRecordingTime(0);
      setAppState(AppState.IDLE);
    }
  }, [appState, onAudioData]);

  const startRecording = useCallback(async () => {
    if (appState !== AppState.IDLE) return;
    
    setError(null);
    setTranscript('');
    setLiveTranscript('');
    setRecordingTime(0);
    setAudioBlob(null);
    recordedChunksRef.current = [];
    setAppState(AppState.GETTING_PERMISSION);

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!audioContextRef.current || !mediaStreamRef.current) return;
            setAppState(AppState.RECORDING);
            startTimer();
            mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              recordedChunksRef.current.push(new Float32Array(inputData));
              onAudioData?.(inputData);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              liveTranscriptRef.current += text;
              setLiveTranscript(liveTranscriptRef.current);
            }
            if (message.serverContent?.turnComplete) {
              const fullInput = liveTranscriptRef.current;
              if (fullInput.trim()) {
                  setTranscript(prev => prev + fullInput + '\n\n');
              }
              liveTranscriptRef.current = '';
              setLiveTranscript('');
            }
            
            // Handle audio output from the model as per API guidelines
            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
            if (base64EncodedAudioString && outputAudioContextRef.current) {
                // The API requires handling audio output. Since this is a transcription app,
                // we decode the audio to fulfill the requirement but do not play it.
                await decodeAudioData(
                    decode(base64EncodedAudioString),
                    outputAudioContextRef.current,
                    24000,
                    1,
                );
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('API Error:', e);
            setError('An API error occurred. Please try again.');
            stopRecording();
          },
          onclose: (e: CloseEvent) => {
            console.log('API connection closed.');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO], 
          inputAudioTranscription: {},
          systemInstruction: SYSTEM_INSTRUCTIONS[language],
        },
      });

    } catch (err) {
      console.error("Failed to start recording:", err);
      setError("Could not access microphone. Please check permissions and try again.");
      setAppState(AppState.IDLE);
    }
  }, [appState, stopRecording, language, onAudioData]);
  
  const transcribeFile = useCallback(async (file: File) => {
    if (appState !== AppState.IDLE) return;

    setError(null);
    setTranscript('');
    setLiveTranscript('');
    setAudioBlob(null);
    setAppState(AppState.TRANSCRIBING_FILE);

    try {
        // Robust MIME type detection
        const extension = file.name.split('.').pop()?.toLowerCase().trim();
        let mimeType = file.type;

        // Map of extensions to Gemini-supported MIME types
        const mimeMap: Record<string, string> = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'm4a': 'audio/mp4',
            'mp4': 'audio/mp4',
            'aac': 'audio/aac',
            'flac': 'audio/flac',
            'ogg': 'audio/ogg',
            'opus': 'audio/ogg',
            'webm': 'audio/webm',
            '3gp': 'audio/3gpp',
            'amr': 'audio/amr',
            'oga': 'audio/ogg',
            'mpga': 'audio/mpeg',
        };

        // 1. Prioritize extension mapping if available
        if (extension && mimeMap[extension]) {
            mimeType = mimeMap[extension];
        } 
        // 2. Handle specific browser inconsistencies for M4A
        else if (mimeType === 'audio/x-m4a') {
            mimeType = 'audio/mp4';
        }

        // 3. Fallback: If type is empty but extension is m4a (common on some OSs)
        if (extension === 'm4a' && (!mimeType || mimeType === '')) {
             mimeType = 'audio/mp4';
        }

        // 4. Validate MIME type
        const isValidAudio = mimeType && mimeType.startsWith('audio/');
        const isValidVideoContainer = mimeType && ['video/mp4', 'video/webm', 'video/3gpp'].includes(mimeType);

        if (!isValidAudio && !isValidVideoContainer) {
             throw new Error(`Unsupported file type: ${mimeType || 'unknown'}. Please upload a supported audio file (e.g., MP3, WAV, M4A).`);
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const base64Audio = await fileToBase64(file);
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    // Provide the audio first to give the model context before the instruction
                    { inlineData: { mimeType: mimeType, data: base64Audio } },
                    { text: "Transcribe the audio file verbatim." },
                ]
            },
            config: {
                systemInstruction: SYSTEM_INSTRUCTIONS[language],
            }
        });

        const text = response.text;
        if (text && text.trim().length > 0) {
            setTranscript(text + '\n\n');
        } else {
             // Check if the model stopped due to safety or other reasons
             const candidate = response.candidates?.[0];
             if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                 console.warn("Transcription stopped due to:", candidate.finishReason);
                 throw new Error(`Transcription stopped due to: ${candidate.finishReason}`);
             }
            throw new Error("empty transcription");
        }
    } catch (err) {
        console.error("Failed to transcribe file:", err);
        let userMessage = "An unexpected error occurred. Please try again.";
        if (err instanceof Error) {
            const errorMessage = err.message.toLowerCase();
            if (errorMessage.includes('unsupported file type')) {
                userMessage = err.message;
            } else if (errorMessage.includes('corrupt') || errorMessage.includes('decode error')) {
                userMessage = "The uploaded file seems to be corrupted or is not a valid audio file.";
            } else if (errorMessage.includes('empty transcription')) {
                userMessage = "Transcription result was empty. This can happen if the audio file is silent or contains no speech.";
            } else if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
                userMessage = "The transcription was blocked by safety filters.";
            } else if (errorMessage.includes('400')) {
                 userMessage = "The server rejected the file. It might be in an unsupported format.";
            }
        }
        setError(userMessage);
    } finally {
        setAppState(AppState.IDLE);
    }
  }, [appState, language]);


  // Create a ref to hold the latest state and cleanup function.
  // This avoids dependency issues in the unmount effect.
  const cleanupStateRef = useRef({ appState, stopRecording });
  useEffect(() => {
    cleanupStateRef.current = { appState, stopRecording };
  }, [appState, stopRecording]);

  useEffect(() => {
    // This effect runs only once on mount, returning a cleanup function for unmount.
    return () => {
      const { appState: finalState, stopRecording: finalStop } = cleanupStateRef.current;
      // If the component unmounts while recording, getting permission, or paused,
      // ensure we stop the recording process cleanly.
      if (
        [
          AppState.RECORDING,
          AppState.GETTING_PERMISSION,
          AppState.PAUSED,
        ].includes(finalState)
      ) {
        finalStop();
      }
    };
  }, []); // Empty dependency array ensures this is an unmount effect only.

  return { appState, transcript, liveTranscript, error, recordingTime, audioBlob, startRecording, stopRecording, transcribeFile, pauseRecording, resumeRecording };
};
