/**
 * AudioService.ts — MicNet (SDK 56, expo-file-system v2)
 *
 * Uses the new File / Directory / Paths API.
 * Size info is obtained via fetch HEAD request for uploads or
 * via legacy import for listing (acceptable workaround).
 */

import { Platform } from 'react-native';

let RecordingPresets: any = { HIGH_QUALITY: {} };
let setAudioModeAsync: any = async () => {};
let requestRecordingPermissionsAsync: any = async () => ({ granted: true });
let Directory: any = class { list() { return []; } constructor() {} };
let File: any = class { constructor() {} name=''; uri=''; delete() {} async upload() { return { status: 200 }; } };
let Paths: any = { document: '' };
let UploadType: any = { MULTIPART: 1 };

if (Platform.OS !== 'web') {
  const expoAudio = require('expo-audio');
  RecordingPresets = expoAudio.RecordingPresets;
  setAudioModeAsync = expoAudio.setAudioModeAsync;
  requestRecordingPermissionsAsync = expoAudio.requestRecordingPermissionsAsync;

  const expoFs = require('expo-file-system');
  Directory = expoFs.Directory;
  File = expoFs.File;
  Paths = expoFs.Paths;
  UploadType = expoFs.UploadType;
}

// ── Recording Options ─────────────────────────────────────────────────────────
export const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY };

// ── Stream Options ────────────────────────────────────────────────────────────
export const STREAM_OPTIONS = {
  sampleRate: 16000,
  channels: 1 as const,
  encoding: 'int16' as const,  // 'float32' | 'int16'
};

// ─── Permission ───────────────────────────────────────────────────────────────
export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

// ─── Audio mode ───────────────────────────────────────────────────────────────
export async function configureAudioForRecording(background = true) {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    allowsBackgroundRecording: background,
  });
}

// ─── File Management (expo-file-system v2) ────────────────────────────────────

export interface LocalRecording {
  filename: string;
  uri: string;
  size: number;
  modificationTime: number;
}

/** List all audio recordings in document directory */
export async function listRecordings(): Promise<LocalRecording[]> {
  try {
    const dir = new Directory(Paths.document);
    const items = dir.list();

    const audioFiles = items.filter(
      (item): item is File =>
        item instanceof File &&
        /\.(m4a|3gp|mp3|wav)$/i.test(item.name)
    );

    // For each file, try to get size via a native stat workaround
    const results = await Promise.all(
      audioFiles.map(async (file): Promise<LocalRecording> => {
        let size = 0;
        let modificationTime = 0;
        try {
          // Use fetch to get content-length (file:// URIs support this on RN)
          const response = await fetch(file.uri, { method: 'HEAD' });
          const cl = response.headers.get('content-length');
          if (cl) size = parseInt(cl, 10);
        } catch {}

        return {
          filename: file.name,
          uri: file.uri,
          size,
          modificationTime,
        };
      })
    );

    return results;
  } catch (err) {
    console.warn('[Audio] listRecordings failed:', err);
    return [];
  }
}

/** Delete a recording by URI */
export async function deleteRecording(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    file.delete();
  } catch {}
}

/** Upload a recording to the server using expo-file-system v2 File.upload() */
export async function uploadRecordingToServer(
  fileUri: string,
  serverHttpUrl: string,
  deviceId: string,
  authToken: string,
): Promise<boolean> {
  try {
    const file = new File(fileUri);
    const filename = file.name;

    const result = await file.upload(`${serverHttpUrl}/api/recordings/upload`, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/mp4',
      parameters: { deviceId },
      headers: { 'x-auth-token': authToken },
    });

    return result.status >= 200 && result.status < 300;
  } catch (err) {
    console.warn('[Audio] Upload failed (trying fetch fallback):', err);

    // Fallback: fetch FormData upload
    try {
      const formData = new FormData();
      formData.append('deviceId', deviceId);
      formData.append('file', {
        uri: fileUri,
        name: fileUri.split('/').pop() ?? 'recording.m4a',
        type: 'audio/mp4',
      } as any);

      const res = await fetch(`${serverHttpUrl}/api/recordings/upload`, {
        method: 'POST',
        headers: { 'x-auth-token': authToken },
        body: formData,
      });
      return res.ok;
    } catch (e2) {
      console.warn('[Audio] Fetch upload also failed:', e2);
      return false;
    }
  }
}

export async function uploadBlobToServer(
  blob: Blob,
  serverHttpUrl: string,
  deviceId: string,
  authToken: string,
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('deviceId', deviceId);
    formData.append('file', blob, `web_recording_${Date.now()}.webm`);

    const res = await fetch(`${serverHttpUrl}/api/recordings/upload`, {
      method: 'POST',
      headers: { 'x-auth-token': authToken },
      body: formData,
    });
    return res.ok;
  } catch (err) {
    console.warn('[Audio] Web Blob Upload failed:', err);
    return false;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─── Device ID ────────────────────────────────────────────────────────────────
let _deviceId = '';
export function setDeviceId(id: string) { _deviceId = id; }
export function getDeviceId() { return _deviceId; }
