export class WebAudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStartTime = 0;

  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;

  async requestPermission(): Promise<boolean> {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      return false;
    }
  }

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.start();
    this.recordingStartTime = Date.now();
  }

  async stopRecording(): Promise<{ blob: Blob; durationMillis: number }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve({ blob: new Blob(), durationMillis: 0 });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const durationMillis = Date.now() - this.recordingStartTime;
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.mediaRecorder?.stream.getTracks().forEach(t => t.stop());
        this.mediaRecorder = null;
        resolve({ blob, durationMillis });
      };

      this.mediaRecorder.stop();
    });
  }

  async startStreaming(onData: (base64: string, sampleRate: number) => void): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.scriptNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
    
    this.scriptNode.onaudioprocess = (e) => {
      const inputBuffer = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputBuffer.length);
      for (let i = 0; i < inputBuffer.length; i++) {
        let s = Math.max(-1, Math.min(1, inputBuffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      const buffer = pcm16.buffer;
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      
      onData(base64, 16000);
    };

    source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioCtx.destination);
  }

  stopStreaming(): void {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }
}

export const webAudioService = new WebAudioService();
