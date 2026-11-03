/**
 * Guarda de regressão do manifesto Android.
 *
 * Contexto (bug real, dois aparelhos): o app dizia "permissão de microfone
 * negada" mesmo com o microfone autorizado no sistema. Causa raiz: o Capacitor
 * pede DUAS permissões quando a página chama `getUserMedia()` e só libera a
 * captura se todas vierem concedidas —
 *
 *   // node_modules/@capacitor/android/.../BridgeWebChromeClient.java
 *   if (resources.contains("android.webkit.resource.AUDIO_CAPTURE")) {
 *       permissionList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
 *       permissionList.add(Manifest.permission.RECORD_AUDIO);
 *   }
 *   ... if (!permission.getValue()) granted = false;  → request.deny()
 *
 * Uma permissão pedida em tempo de execução e não declarada no manifesto volta
 * como negada. Como `MODIFY_AUDIO_SETTINGS` havia sido removida do manifesto
 * (parecia não usada), o WebView passou a negar o microfone sempre. Este teste
 * impede que a "limpeza" seja repetida.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(
  join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
  'utf8',
);

describe('AndroidManifest.xml', () => {
  it('declara as duas permissões exigidas pela captura de áudio do WebView', () => {
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    // Obrigatória: BridgeWebChromeClient.onPermissionRequest pede as duas juntas.
    expect(manifest).toContain('android.permission.MODIFY_AUDIO_SETTINGS');
  });

  it('mantém a lista de permissões mínima (sem câmera, localização ou armazenamento)', () => {
    const perms = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(perms.sort()).toEqual([
      'android.permission.INTERNET',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECORD_AUDIO',
    ]);
  });

  it('mantém as travas de backup e de tráfego em texto claro', () => {
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
  });

  it('exige hardware de microfone, mas não de câmera', () => {
    expect(manifest).toContain('android.hardware.microphone');
    expect(manifest).not.toContain('android.hardware.camera');
  });
});
