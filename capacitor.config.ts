/**
 * Configuração do alvo Android (Capacitor).
 *
 * O app Android reutiliza o MESMO renderer do desktop: `npm run build:renderer`
 * gera `dist/`, e o Capacitor copia esses arquivos para dentro do projeto
 * Android (`android/app/src/main/assets/public`). O WebView carrega por
 * `https://localhost`, então a CSP do `index.html` continua valendo.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.dev.yukidev.prismavocal',
  appName: 'Prisma Vocal',
  webDir: 'dist',
  android: {
    // Nada de conteúdo misto: o app é offline e não precisa de http.
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#0b0d12',
    },
  },
};

export default config;
