/**
 * App.tsx — MicNet v3 (User Mode)
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, StatusBar, SafeAreaView, Animated, TouchableOpacity, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsService } from './src/services/WebSocketService';
import { setDeviceId } from './src/services/AudioService';
import HomeScreen from './src/screens/HomeScreen';
import PairingScreen from './src/screens/PairingScreen';

const BG = '#0f1117';
const CARD = '#1a1f2e';
const ACCENT = '#3b82f6';
const BORDER = 'rgba(255,255,255,0.07)';

export default function App() {
  const [deviceId,            setDId]         = useState('');
  const [deviceName,          setDName]       = useState('');
  const [serverWsUrl,         setWsUrl]       = useState('');
  const [serverHttpUrl,       setHttpUrl]     = useState('');
  const [pairingCode,         setPairingCode] = useState('');
  const [backgroundRecording, setBgRec]       = useState(true);
  const [wsConnected,         setWsConnected] = useState(false);
  const [ready,               setReady]       = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const wsUrl   = await AsyncStorage.getItem('serverUrl');
      const httpUrl = await AsyncStorage.getItem('serverHttpUrl');
      const code    = await AsyncStorage.getItem('authToken'); // we use authToken key for pairing code
      let   id      = await AsyncStorage.getItem('deviceId');
      let   name    = await AsyncStorage.getItem('deviceName');
      const bg      = await AsyncStorage.getItem('backgroundRecording');

      if (!id)   { id   = `device_${Math.random().toString(36).slice(2,10)}`; await AsyncStorage.setItem('deviceId', id); }
      if (!name) { name = `Phone ${Math.floor(Math.random() * 9000 + 1000)}`;  await AsyncStorage.setItem('deviceName', name); }

      if (wsUrl)   setWsUrl(wsUrl);
      if (httpUrl) setHttpUrl(httpUrl);
      if (code)    setPairingCode(code);
      setDId(id); setDName(name);
      if (bg !== null) setBgRec(bg === 'true');
      setDeviceId(id);

      wsService.onStatusChange = (c) => setWsConnected(c);
      
      if (wsUrl && code) {
        await wsService.init();
      }
      
      setReady(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    })();
    return () => { wsService.disconnect(); };
  }, []);

  const handlePair = async (wsUrl: string, httpUrl: string, code: string) => {
    setWsUrl(wsUrl);
    setHttpUrl(httpUrl);
    setPairingCode(code);
    await AsyncStorage.setItem('serverUrl', wsUrl);
    await AsyncStorage.setItem('serverHttpUrl', httpUrl);
    await AsyncStorage.setItem('authToken', code);
    await wsService.init();
  };

  const handleUnpair = async () => {
    wsService.disconnect();
    setPairingCode('');
    await AsyncStorage.removeItem('authToken');
  };

  if (!ready) {
    return <View style={styles.splash}><StatusBar barStyle="light-content" backgroundColor={BG} /></View>;
  }

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <SafeAreaView style={styles.safe}>

        {!pairingCode ? (
          <PairingScreen onPair={handlePair} />
        ) : (
          <View style={{flex: 1}}>
            <View style={styles.topBar}>
              <View style={styles.topBarLeft}>
                <Text style={styles.appName}>MicNet</Text>
                <View style={[styles.wsStatus, wsConnected ? styles.wsOn : styles.wsOff]}>
                  <View style={[styles.wsDot, { backgroundColor: wsConnected ? '#34d399' : '#f87171' }]} />
                  <Text style={[styles.wsText, { color: wsConnected ? '#34d399' : '#f87171' }]}>
                    {wsConnected ? 'Paired' : 'Offline'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleUnpair}>
                <Text style={styles.unpairText}>Unpair</Text>
              </TouchableOpacity>
            </View>

            <HomeScreen
              deviceId={deviceId}
              deviceName={deviceName}
              backgroundRecording={backgroundRecording}
              serverHttpUrl={serverHttpUrl}
              authToken={pairingCode}
            />
          </View>
        )}

      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  splash: { flex: 1, backgroundColor: BG },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: BG },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appName: { fontSize: 20, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.5 },
  wsStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  wsOn: { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.25)' },
  wsOff: { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' },
  wsDot: { width: 6, height: 6, borderRadius: 3 },
  wsText: { fontSize: 11, fontWeight: '700' },
  unpairText: { fontSize: 13, color: '#f87171', fontWeight: '600', padding: 8 },
});
