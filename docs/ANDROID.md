# Prisma Vocal no Android

O app Android usa **o mesmo código de interface e o mesmo DSP** do desktop. O que muda é a
camada de armazenamento e o que o sistema oferece (compartilhar arquivo, notificação), encapsulados
pelo [Capacitor](https://capacitorjs.com): o renderer React roda dentro de um WebView, e os plugins
nativos cobrem o que o navegador não faz.

```
src/renderer/ ─┐
src/core/      ├─ build:renderer ─→ dist/ ─cap sync─→ android/app/src/main/assets/public
src/shared/   ─┘                                          │
                                                          └─ WebView (https://localhost)
src/renderer/state/bridge-android.ts ─→ IndexedDB + AES-GCM + plugins nativos
```

## O que já está pronto no repositório

| Item | Situação |
| --- | --- |
| `android/` (projeto Gradle completo) | gerado por `npx cap add android`, versionado |
| Ícone, splash e cor de tema | trocados pelo ícone do app |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS` | declaradas no `AndroidManifest.xml` |
| `allowBackup="false"` + `network_security_config` | dados fora do backup do Google; nenhum tráfego em texto claro |
| Armazenamento cifrado | AES-GCM com chave **não-extraível** guardada no IndexedDB |
| Exportar WAV / relatório / backup | grava no cache e abre o compartilhamento do Android |
| Importar backup | seletor de arquivos nativo (`input type=file`) |
| Lembretes | notificações locais agendadas por dia da semana |
| Layout de celular | barra inferior com ícones; em ≤ 400 px, grade 4×2 com todas as 8 seções visíveis |
| Área segura | `env(safe-area-inset-top/bottom)` — nada fica sob notch ou barra de gestos |
| Toque | 44 px de altura para controles (24 px para checkbox), sem atraso de 300 ms |
| Paisagem | barra inferior só com ícones e topo compacto quando a altura é ≤ 480 px |
| Abas longas | quebram em pílulas em vez de sair da tela |

O que **não** foi verificado (seja honesto com você mesmo antes de publicar): o APK não foi
compilado nem executado em aparelho real nesta versão. O que foi verificado: typecheck, os 84
testes, o build do WebView, o layout em 390×844 (`npm run screenshots:mobile`) e o bridge Android
rodando de verdade em Chromium com criptografia (`npm run smoke:android`).

## Requisitos

1. **Node 22+** (o CLI do Capacitor 8 exige) — `node -v`.
2. **JDK 21** — o Gradle do projeto usa Java 21. Android Studio traz um; para linha de comando:
   `winget install EclipseAdoptium.Temurin.21.JDK` (Windows) ou `sudo apt install openjdk-21-jdk`.
3. **Android SDK** — o mais simples é o **Android Studio** (inclui SDK Manager e emulador):
   `winget install Google.AndroidStudio`. No SDK Manager instale *Android SDK Platform 36* e
   *Android SDK Build-Tools 36.x*.
4. Um celular Android com **depuração USB** ativada (ou um emulador).

Confira depois de instalar:

```powershell
node -v
java -version            # 21.x
$env:ANDROID_HOME        # ex.: C:\Users\<voce>\AppData\Local\Android\Sdk
```

Se `ANDROID_HOME` estiver vazio, crie a variável de ambiente apontando para a pasta do SDK e reabra
o terminal.

## Passo a passo

### 1. Gerar o WebView e sincronizar

```powershell
cd C:\dev\prisma-vocal
npm install
npm run build:renderer            # gera dist/
npx cap sync android              # copia dist/ + plugins para android/
```

`cap sync` precisa ser rodado **toda vez** que você mudar algo em `src/`. É o equivalente Android
do `npm run build`.

### 2. Abrir no Android Studio e rodar

```powershell
npx cap open android
```

No Android Studio: escolha o aparelho no topo e clique em **Run ▶**. O app instala e abre no
celular. Na primeira execução, autorize **microfone** (senão o HUD fica parado) e, se usar
lembretes, **notificações**.

Sem Android Studio, por linha de comando:

```powershell
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

(Linux/macOS: `./gradlew assembleDebug`. A primeira execução baixa o Gradle e as dependências —
alguns minutos e ~1 GB.)

### 3. Instalar direto pelo celular

Copie `app-debug.apk` para o aparelho e abra. O Android pede para permitir "instalar apps
desconhecidos" para o app de arquivos — é esperado fora da Play Store.

## Versão de release assinada

```powershell
keytool -genkey -v -keystore prisma-vocal.jks -keyalg RSA -keysize 2048 -validity 10000 -alias prisma
```

Crie `android/keystore.properties` (**não versionar** — já está no `.gitignore`):

```properties
storeFile=C:/dev/prisma-vocal.jks
storePassword=...
keyAlias=prisma
keyPassword=...
```

O `android/app/build.gradle` do repositório **já vem com a assinatura configurada**: ele lê
`android/keystore.properties`, se existir. Sem o arquivo, o build continua funcionando (o APK de
debug é assinado pelo Android; o release sai não assinado). Trecho relevante:

```gradle
def keystoreProps = new Properties()
def keystoreFile = rootProject.file('keystore.properties')
def hasKeystore = keystoreFile.exists()
if (hasKeystore) {
    keystoreFile.withInputStream { keystoreProps.load(it) }
}

android {
    signingConfigs {
        if (hasKeystore) {
            release {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (hasKeystore) { signingConfig signingConfigs.release }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

```powershell
cd android
.\gradlew.bat assembleRelease      # APK assinado
.\gradlew.bat bundleRelease        # .aab para a Play Store
```

## Permissões

Só o necessário, cada uma com justificativa:

| Permissão | Por quê | Se negar |
| --- | --- | --- |
| `RECORD_AUDIO` | captura de voz para o HUD e as gravações | o app abre, mas o HUD fica parado |
| `MODIFY_AUDIO_SETTINGS` | **exigida pelo Capacitor**: em `BridgeWebChromeClient.onPermissionRequest()` o WebView pede `MODIFY_AUDIO_SETTINGS` *e* `RECORD_AUDIO` e só libera o `getUserMedia` se as duas vierem concedidas | sem ela nesta lista, o microfone é negado mesmo com `RECORD_AUDIO` autorizada |
| `POST_NOTIFICATIONS` | lembretes de prática (Android 13+) | o resto funciona; lembretes não aparecem |
| `INTERNET` | exigida pelo WebView que serve os arquivos em `https://localhost` | — |

`MODIFY_AUDIO_SETTINGS` é de nível *normal*: é concedida na instalação, não aparece como diálogo para
o usuário e não dá acesso ao microfone — só ao caminho de configuração de áudio do WebView. Ela
**precisa** estar no manifesto; removê-la (parece não usada) faz o WebView negar a captura sempre,
com o sintoma "permissão de microfone negada" mesmo com o microfone autorizado no sistema.

Não há acesso a contatos, localização, câmera, armazenamento externo nem leitura de arquivos fora do
que você escolhe no seletor. Nenhum plugin de rede está instalado.

## Segurança

| Configuração | Valor | Efeito |
| --- | --- | --- |
| `android:allowBackup` | `false` | dados e chave não vão para o backup do Google |
| `android:usesCleartextTraffic` | `false` | nenhum tráfego HTTP em texto claro |
| `network_security_config.xml` | `cleartextTrafficPermitted="false"` | reforça o item acima para todo o app |
| CSP (`index.html`) | `default-src 'self'; script-src 'self'; connect-src 'self'` | o WebView não carrega script nem faz requisição externa |
| `openExternal` | allowlist `https://github.com/yuki-dev-bit` | o app não vira abre-links genérico |
| Chave AES | `CryptoKey` não-extraível | não pode ser lida por JS, só usada para cifrar/decifrar |
| "Apagar tudo" | limpa dados **e** a chave | o que sobrar no banco é ilegível |
| `keystore.properties`, `*.jks` | no `.gitignore` | chave de assinatura não vai para o repositório |

Limite honesto: com acesso root ao aparelho, alguém pode ler o banco do WebView e *pedir* ao
WebView que decifre (não consegue exportar a chave). É mais forte que o modo navegador (sem
criptografia) e mais fraco que o DPAPI do Windows.

## Desempenho e bateria

- O HUD desenha com DPR limitado a 2 (em telas 3x isso corta 55% dos pixels sem perda visível).
- O loop de animação **pausa** quando a aba está em segundo plano (`document.hidden`) e quando o
  canvas sai da viewport (`IntersectionObserver`) — menos CPU e bateria com o app aberto em outra tela.
- `prefers-reduced-motion` reduz a taxa de redesenho para ~12 fps.
- Em aparelho modesto (Android 8, 2 GB), reduza a taxa de amostragem em Configurações → Áudio.

## Verificação de layout

O layout é auditado automaticamente em **7 tamanhos × 8 telas** (56 combinações):

```bash
npm run build:renderer
npm run test:mobile          # 320, 360, 390, 412, 568×320, 844×390 (paisagem), 768 (tablet)
npm run test:mobile:screens  # salva capturas em docs/screenshots/layout/
```

O teste falha quando encontra rolagem horizontal, elemento fora da tela, alvo de toque menor que
44 px (24 px para checkbox), texto cortado ou erro de console. Critérios: WCAG 2.2 (Target Size) e
Material Design.

## Diferenças reais em relação ao desktop

| Aspecto | Desktop (Electron) | Android (Capacitor) |
| --- | --- | --- |
| Armazenamento | arquivos `.enc` em `%APPDATA%` | IndexedDB do WebView (`/data/data/br.dev.yukidev.prismavocal`) |
| Chave de criptografia | DPAPI/Keychain via `safeStorage` | `CryptoKey` AES-256 **não-extraível** no IndexedDB |
| Backup do sistema | não se aplica | desligado (`allowBackup="false"`) |
| Exportar WAV/relatório | diálogo "Salvar como" | folha de compartilhamento do Android |
| Lembretes | notificação nativa + agendador do processo principal | `LocalNotifications` (o app pode estar fechado; o Android entrega) |
| Tela | janela 1280×860 | retrato, barra inferior, área segura |
| Segundo plano | janela continua aberta | WebView é suspenso: **não** grava com o app em segundo plano |

## Limitações honestas

- **Não compilado nem executado em aparelho real** nesta versão. O projeto Gradle está completo,
  mas o primeiro build é seu.
- Latência de análise em aparelhos antigos: o DSP roda no WebView; em aparelho com Android 8 e
  2 GB, o HUD pode ficar abaixo de 30 fps. Reduza a taxa de amostragem em Configurações → Áudio.
- `AudioWorklet` exige WebView atualizado (Chrome 74+). Em aparelhos com WebView muito antigo o app
  avisa e cai para o modo básico.
- Notificações dependem da otimização de bateria do fabricante (Xiaomi, Samsung): se o lembrete não
  chegar, libere o app em "Bateria → Sem restrições".
- Importar backup grava no armazenamento — não há "exportar tudo em zip".
- Em tablet (≥ 640 px) a interface usa o layout de desktop com a barra lateral em rail de ícones;
  os alvos de toque são ampliados por `@media (pointer: coarse)`, mas o texto não cresce.
- Teclado físico/gamepad e navegação por D-pad não foram testados.
- A verificação de layout roda em Chromium; fabricantes com WebView alterado (alguns Androids
  antigos) podem renderizar fontes com métricas diferentes — relate se acontecer.

## Calibração no celular

O procedimento é o mesmo do desktop, mas dois detalhes importam no aparelho:

- o microfone do celular costuma ter ganho analógico alto: offsets reais ficam entre ~60 e ~105 dB.
  O app aceita até 120 dB e **não** trunca o valor (o teto antigo de 60 dB produzia estimativas de
  SPL dezenas de dB abaixo do medidor externo);
- calibrar durante a captura funciona sem reiniciar: o analisador recebe o novo offset na hora.

O valor é gravado no IndexedDB cifrado (`app-data:enc`) com data e hora, sobrevive a fechar o app e a
reiniciar o aparelho, e pode ser refeito em Configurações → Áudio → Refazer calibração.

## Problemas comuns

### "Permissão de microfone negada" mesmo com o microfone autorizado

1. Confirme **Ajustes → Apps → Prisma Vocal → Permissões → Microfone** ligado.
2. Force a parada do app (arraste no seletor de apps) e abra de novo: o WebView guarda a última
   negativa até o processo ser reiniciado.
3. Se continuar: verifique se o APK instalado é anterior à correção do manifesto (a
   `MODIFY_AUDIO_SETTINGS` precisa estar declarada — veja [Permissões](#permissões) e
   `tests/android-manifest.test.ts`). Recompile e reinstale.
4. Se o app abre e o medidor fica parado (sem mensagem de erro), é microfone ocupado por outro app
   (chamada, gravador, assistente): o app agora diz isso explicitamente.

| Sintoma | Causa / solução |
| --- | --- |
| `SDK location not found` | `ANDROID_HOME` não definido, ou falta `android/local.properties` com `sdk.dir=...` |
| `Unsupported class file major version` | JDK errado (use 21) — `java -version` |
| Gradle baixa tudo de novo a cada build | falta de cache: deixe o Android Studio aberto, ou configure `GRADLE_USER_HOME` |
| Tela branca ao abrir | esqueceu `npm run build:renderer && npx cap sync android` |
| HUD não reage | permissão de microfone negada: Configurações do Android → Apps → Prisma Vocal → Permissões |
| Áudio com estalos | "Otimização de áudio" do fabricante; teste com fone com microfone |
| Lembrete não chega | otimização de bateria (veja Limitações) |
| `cap` reclama de Node | o CLI exige Node 22+; `node -v` |

## Verificação automática (sem aparelho)

```powershell
npm run test:mobile        # 7 tamanhos × 8 telas: overflow, alvo de toque, texto cortado
npm run smoke:android      # bridge Android cifrando/decifrando e persistindo (Chromium)
npm run screenshots:mobile # 4 capturas em 390×844 em docs/screenshots/
```

Os três exigem `npm run build:renderer` antes e não substituem o celular: não tocam no microfone
nem nos plugins nativos (compartilhamento e notificações).
