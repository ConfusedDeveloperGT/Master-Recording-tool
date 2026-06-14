import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadRecordingToServer } from './AudioService';

const QUEUE_KEY = 'micnet_offline_queue';

export async function addToOfflineQueue(uri: string) {
  try {
    const q = await getOfflineQueue();
    if (!q.includes(uri)) {
      q.push(uri);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    }
  } catch (e) {
    console.error('Error adding to offline queue', e);
  }
}

export async function getOfflineQueue(): Promise<string[]> {
  try {
    const s = await AsyncStorage.getItem(QUEUE_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export async function processOfflineQueue(serverHttpUrl: string, deviceId: string, authToken: string): Promise<number> {
  let uploadedCount = 0;
  try {
    const q = await getOfflineQueue();
    if (q.length === 0) return 0;

    const newQ: string[] = [];
    for (const uri of q) {
      const ok = await uploadRecordingToServer(uri, serverHttpUrl, deviceId, authToken);
      if (ok) {
        uploadedCount++;
      } else {
        newQ.push(uri); // keep in queue if failed
      }
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newQ));
  } catch (e) {
    console.error('Error processing offline queue', e);
  }
  return uploadedCount;
}
