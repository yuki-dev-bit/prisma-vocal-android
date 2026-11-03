# Prisma Vocal 1.0.0 (Android)

Treino e análise de voz **offline** no celular. Nada sai do aparelho: sem conta, sem nuvem, sem
telemetria. O app não faz requisições de rede — não existe `fetch`, `WebSocket` nem `eval` no
código (a CSP do WebView também bloqueia).

## Baixar e instalar

| Arquivo | O que é |
| --- | --- |
| `app-release.apk` | APK assinado, Android 7.0 (API 24) ou mais novo |
| `SHA256SUMS.txt` | Hash para conferir a integridade do download |

1. Baixe o `app-release.apk` e o `SHA256SUMS.txt`.
2. No celular, permita "instalar apps desconhecidos" para o app de arquivos (fora da Play Store é
   esperado). O APK não vem da Play Store e não é assinado por uma chave de loja.
3. Abra o arquivo e confirme a instalação.

Ou, com o celular conectado e depuração USB ligada:

```powershell
adb install -r app-release.apk
```

Confira o hash no computador (opcional, recomendado):

```powershell
certutil -hashfile app-release.apk SHA256
```

## Primeira execução (4 minutos)

1. **Avaliação** — 7 etapas curtas. Cria o seu perfil (piso, centro, teto, extensão) e calibra as
   metas dos exercícios.
2. Autorize **microfone** quando o Android pedir. Sem isso o medidor fica parado.
3. Se você usa **lembretes**, autorize **notificações** (Android 13+ pede na primeira vez).
4. **Configurações → Áudio → Testar entrada** — fale e ajuste o **ganho** até o pico ficar entre
   **−12 e −6 dBFS**.
5. **Início → Praticar agora** — segue o próximo passo recomendado.

## O que o app mede

Frequência fundamental (YIN), formantes, ressonância relativa, brilho, HNR, soprosidade e nível.
Tudo em tempo real, com o microfone do aparelho.

- As medidas são **estimativas acústicas** para acompanhar a sua evolução, não um diagnóstico.
- Ressonância e brilho são **relativos**: microfones de celular variam muito. Compare tomadas feitas
  no mesmo aparelho, na mesma distância.
- Celulares com "otimização de áudio" agressiva podem cortar graves ou aplicar compressão; se o
  resultado parecer estranho, teste com fone com microfone.

## Onde ficam seus dados

Ficam só no aparelho: perfil, diário, progresso e gravações no armazenamento do app, cifrados com
AES-GCM e uma chave **não-extraível** guardada no próprio WebView (IndexedDB). Backup em JSON (sem
áudio) está em Configurações → Dados; "Apagar tudo" está em Privacidade.

Desinstalar o app, ou usar "Limpar dados" nas configurações do Android, apaga tudo — inclusive a
chave. Não há cópia em nuvem: se quiser guardar, exporte o JSON antes.

## Requisitos

- Android 7.0 (API 24) ou mais novo; alvo em API 36.
- Microfone funcional.
- ~30 MB de disco.

## Limitações conhecidas

- **Não foi testado em aparelho real por quem escreveu**: o typecheck, o lint, os 330 testes, o build do
  renderer, o smoke do bridge (IndexedDB cifrado) e o smoke de calibração rodam em Chromium, e o CI
  roda no GitHub (Ubuntu, Node 22 e 24). O APK, o microfone do aparelho e as notificações dependem
  da sua validação. Se algo falhar, abra uma issue com o modelo do aparelho e a versão do Android.
- **Sem build para a Play Store** nesta versão: é um APK para instalar direto (sideload).
- **Lembretes** dependem da otimização de bateria do fabricante; em alguns aparelhos só chegam com o
  app aberto recentemente.
- A captura acontece **com o app em primeiro plano**; não há gravação em segundo plano.
- Não substitui fonoaudiólogo(a) nem avalia saúde vocal. Dor, rouquidão por mais de duas semanas,
  perda de extensão ou fadiga constante: procure atendimento profissional.

## Código

Fonte completa nesta release (tag `v1.0.0-android`), licença MIT. Capacitor 8.6 + React 19 +
Vite 8 + TypeScript estrito, com o mesmo DSP do app de PC em `src/core/dsp/`. O app de PC
(Electron: Windows, Linux, macOS) fica em
[prisma-vocal](https://github.com/yuki-dev-bit/prisma-vocal).
