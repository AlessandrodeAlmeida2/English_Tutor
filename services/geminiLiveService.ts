
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { base64ToUint8Array, createPcmBlob, decodeAudioData, downsampleTo16k } from '../utils/audioUtils';
import { ConnectionState } from '../types';

export type TranscriptCallback = (text: string, role: 'user' | 'model', isComplete: boolean) => void;
export type VolumeCallback = (volume: number) => void;
export type StatusCallback = (status: ConnectionState) => void;

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private stream: MediaStream | null = null;

  // Callbacks
  private onTranscript: TranscriptCallback;
  private onStatus: StatusCallback;
  private onVolume: VolumeCallback;

  constructor(apiKey: string, onTranscript: TranscriptCallback, onStatus: StatusCallback, onVolume: VolumeCallback) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.onVolume = onVolume;
  }

  async connect() {
    try {
      this.onStatus(ConnectionState.CONNECTING);

      // 1. Setup Audio Contexts
      // Note: We use the system default sample rate to avoid browser compatibility issues.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass();
      this.outputAudioContext = new AudioContextClass();
      
      // CRITICAL: Resume contexts immediately. Browsers often suspend them until user interaction.
      // Since this is called from a click handler, it should work, but we await it to be safe.
      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      // Setup Output Node
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 2. Get Microphone Stream
      // We request 16k, but we don't rely on it. We downsample manually later.
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000 
        } 
      });
      
      // 3. Connect to Gemini Live API
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          systemInstruction: `
            You are "Teacher Alice", a high-level English Dialect Coach and Tutor.
            The user is a Portuguese speaker who wants to sound like a NATIVE American English speaker.

            YOUR METHODOLOGY:
            You must listen to what the user says and act in two steps for EVERY turn:

            STEP 1: THE COACHING (The Priority)
            - Listen for "Portinglês" (direct translations from Portuguese). 
            - Listen for grammatical errors.
            - Listen for stiff/textbook phrasing.
            - BEFORE replying to the topic, say: "Tip: ..." or "Correction: ...".
            - Give the "Native Version": Suggest idioms, phrasal verbs, or contractions that make them sound fluent.
            
            Example:
            User: "I have 20 years."
            Alice: "Quick correction: In English we say 'I am 20'. We use the verb to be for age."
            
            Example:
            User: "I will make a party."
            Alice: "To sound more native, say 'I'm throwing a party' or 'I'm hosting a party'."

            STEP 2: THE CONVERSATION
            - After the tip, respond to the user's statement naturally to keep the flow going.
            - Be friendly, encouraging, but rigorous about quality.
            
            Start by introducing yourself enthusiastically and asking a question to get them talking.
          `,
        },
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onerror: (e) => {
            console.error('Gemini Live Error:', e);
            this.onStatus(ConnectionState.ERROR);
          },
          onclose: (e) => {
            console.log('Gemini Live Closed', e);
            this.onStatus(ConnectionState.DISCONNECTED);
          },
        },
      });

    } catch (error) {
      console.error('Connection failed:', error);
      this.onStatus(ConnectionState.ERROR);
      await this.disconnect();
    }
  }

  private async handleOpen() {
    this.onStatus(ConnectionState.CONNECTED);
    if (!this.inputAudioContext || !this.stream) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
    
    // Buffer size 4096 offers a good balance between latency (~90ms at 44.1k) and stability
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // 1. Calculate Volume (RMS) for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onVolume(rms);

      // 2. Downsample to 16kHz
      // CRITICAL: Use the *buffer's* sample rate, not the context's generic rate, to be precise.
      const actualSampleRate = e.inputBuffer.sampleRate;
      let pcmData = inputData;
      
      if (actualSampleRate !== 16000) {
        pcmData = downsampleTo16k(inputData, actualSampleRate);
      }

      // 3. Create Blob and Send
      const pcmBlob = createPcmBlob(pcmData);
      
      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    this.inputSource.connect(this.processor);
    // Connect to destination to keep the processor alive (silence)
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Transcriptions
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      this.currentOutputTranscription += text;
      this.onTranscript(this.currentOutputTranscription, 'model', false);
    } 
    else if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      this.currentInputTranscription += text;
      this.onTranscript(this.currentInputTranscription, 'user', false);
    }

    if (message.serverContent?.turnComplete) {
      if (this.currentInputTranscription) {
        this.onTranscript(this.currentInputTranscription, 'user', true);
        this.currentInputTranscription = '';
      }
      if (this.currentOutputTranscription) {
        this.onTranscript(this.currentOutputTranscription, 'model', true);
        this.currentOutputTranscription = '';
      }
    }

    // 2. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      try {
        // Decode audio from 24kHz (Gemini default)
        const audioBuffer = await decodeAudioData(
          base64ToUint8Array(base64Audio),
          this.outputAudioContext,
          24000 
        );

        // Schedule playback
        // Ensure we don't schedule in the past, but also keep the stream tight
        const currentTime = this.outputAudioContext.currentTime;
        
        // If nextStartTime is too far behind (lag), reset it to now
        if (this.nextStartTime < currentTime) {
             this.nextStartTime = currentTime;
        }
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.start(this.nextStartTime);
        
        this.nextStartTime += audioBuffer.duration;
      } catch (err) {
        console.error("Error decoding audio:", err);
      }
    }
    
    // Handle Interruption
    if (message.serverContent?.interrupted) {
        this.nextStartTime = this.outputAudioContext?.currentTime || 0;
        this.currentOutputTranscription = ''; 
    }
  }

  async disconnect() {
    // Stop tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Disconnect nodes
    if (this.inputSource) {
        this.inputSource.disconnect();
        this.inputSource = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    // Close contexts
    if (this.inputAudioContext) {
        await this.inputAudioContext.close();
        this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }

    this.onStatus(ConnectionState.DISCONNECTED);
    this.onVolume(0);
  }
}
