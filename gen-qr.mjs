import { createCanvas } from 'canvas';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';

const url = 'exp://10.68.124.121:8081';
const buf = await QRCode.toBuffer(url, { width: 400, margin: 3 });
writeFileSync('./qr-expo.png', buf);
console.log('QR code saved to qr-expo.png for: ' + url);
