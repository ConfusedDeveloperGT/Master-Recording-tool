import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const BG = '#0f1117';
const CARD = '#1a1f2e';
const ACCENT = '#3b82f6';
const BORDER = 'rgba(255,255,255,0.07)';

interface Props {
  onPair: (wsUrl: string, httpUrl: string, code: string) => void;
}

export default function PairingScreen({ onPair }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  
  // Hardcoded for demo, but normally the QR code contains this.
  const DEFAULT_HTTP = 'http://192.168.1.100:3001'; 
  const DEFAULT_WS = 'ws://192.168.1.100:3001';

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    try {
      setScanning(false);
      const payload = JSON.parse(data);
      if (payload.url && payload.code) {
        onPair(payload.url, payload.http || payload.url.replace('ws', 'http'), payload.code);
      } else {
        Alert.alert('Invalid QR Code', 'This QR code does not contain MicNet pairing info.');
      }
    } catch {
      Alert.alert('Scan Failed', 'Unrecognized QR format.');
    }
  };

  const handleManualSubmit = () => {
    if (manualCode.length >= 6) {
      // For manual entry, we'll need the user to configure URL elsewhere,
      // or we assume they are using a public Railway URL.
      // For simplicity in this demo, if they enter a code, we use local network 
      // or a hardcoded default public URL.
      onPair(DEFAULT_WS, DEFAULT_HTTP, manualCode);
    } else {
      Alert.alert('Invalid Code', 'Please enter a valid 6-digit code.');
    }
  };

  if (scanning) {
    if (!permission?.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Camera Access Required</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setScanning(false)}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerText}>Point at the Manager QR Code</Text>
          <TouchableOpacity style={[styles.btn, { marginTop: 40 }]} onPress={() => setScanning(false)}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🎙️</Text>
      <Text style={styles.title}>MicNet User</Text>
      <Text style={styles.subtitle}>Pair with a Manager to continue</Text>

      <TouchableOpacity style={[styles.btn, styles.btnScan]} onPress={() => setScanning(true)}>
        <Text style={styles.btnText}>📷 Scan QR Code</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.or}>OR</Text>
        <View style={styles.line} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Enter 6-Digit Pairing Code</Text>
        <TextInput
          style={styles.input}
          placeholder="123456"
          placeholderTextColor="#475569"
          keyboardType="number-pad"
          value={manualCode}
          onChangeText={setManualCode}
          maxLength={6}
        />
        <TouchableOpacity style={styles.btn} onPress={handleManualSubmit}>
          <Text style={styles.btnText}>Pair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#f1f5f9', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 40, textAlign: 'center' },
  card: { width: '100%', backgroundColor: CARD, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: BORDER },
  label: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' },
  input: { backgroundColor: BG, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 14, color: '#fff', fontSize: 24, textAlign: 'center', letterSpacing: 4, fontFamily: 'monospace', marginBottom: 16 },
  btn: { backgroundColor: ACCENT, padding: 14, borderRadius: 8, alignItems: 'center', width: '100%' },
  btnScan: { backgroundColor: '#10b981' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: BORDER, marginTop: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: BORDER },
  or: { color: '#475569', paddingHorizontal: 12, fontSize: 12, fontWeight: '600' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  scannerText: { color: '#fff', fontSize: 18, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, borderRadius: 8 },
});
