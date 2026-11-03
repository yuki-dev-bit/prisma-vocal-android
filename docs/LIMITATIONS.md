# Limitações conhecidas

Documento de honestidade técnica. Se algo aqui te impedir de usar o app, abra uma issue — várias
destas linhas são melhoráveis.

## Validação

- A validação automatizada cobre `tsc`, o lint, os testes de núcleo e a interface no navegador
  (Chromium + microfone simulado). Isso não substitui um teste no aparelho: o WebView de cada
  fabricante se comporta de um jeito com o microfone e com o áudio.

- **Layout mobile**: auditado em Chromium em 7 tamanhos × 8 telas (`npm run test:mobile`), sem
  overflow, alvo pequeno ou texto cortado. Não foi conferido em aparelho físico, em WebView de
  fabricante modificado, com teclado físico aberto nem com a fonte do sistema ampliada ao máximo.
- **Permissão de microfone**: o caminho de negação foi validado em Chromium (`npm run smoke:mic`) e a
  causa raiz do falso negativo no Android foi confirmada no código do Capacitor 8.6.0, mas a correção
  (manifesto com `MODIFY_AUDIO_SETTINGS`) **não foi verificada em aparelho físico** — não há Android
  neste ambiente. Se o microfone ainda falhar depois de reinstalar, colete `adb logcat | grep -i chrom`
  durante o "Iniciar teste".
- **Calibração**: verificada de ponta a ponta em Chromium com microfone sintético (offset ~99 dB,
  persistência após reload). A precisão depende do medidor externo e do ganho do aparelho; o app não
  substitui um decibelímetro calibrado.
- **Android**: o projeto Capacitor está completo e o bridge (armazenamento cifrado, exportação
  compartilhada, notificações) é verificado em Chromium, mas o **APK não foi compilado nem executado
  em aparelho real** nesta versão. Captura de microfone no WebView, latência em aparelho modesto e
  entrega de notificações dependem de validação no aparelho — veja `docs/ANDROID.md`.

## Análise acústica

- **f0**: YIN falha em voz muito sussurrada (sem periodicidade) e em fala sobreposta. Em f0 muito
  baixa (< 60 Hz), a janela de 128 ms pode ficar apertada.
- **Formantes**: F1 pode ser inseparável de H1 em f0 > ~300 Hz; o app devolve `null` nesse caso.
  F3/F4 são as estimativas menos confiáveis do conjunto.
- **Ressonância**: índice relativo, sem escala absoluta. Mudar de microfone desloca o valor.
- **Soprosidade**: índice percepetivo derivado de HNR + tilt + planura. Não mede fechamento glótico.
- **Nível**: sem calibração, é dBFS (nível digital), não dB SPL. A calibração com medidor externo é
  aproximada e depende da distância/ângulo do microfone.
- **Ruído**: `ruido-alto` alerta, mas não corrige. Ambientes com ventilador/ar-condicionado afetam
  HNR e soprosidade mesmo com gate.

## Interface

- O HUD é otimizado para ponteiro/teclado em telas ≥ 940 px de largura; em telas menores o layout
  empilha, mas os gráficos ficam comprimidos.
- O modo navegador não tem lembretes nativos nem armazenamento cifrado.
- Inglês cobre a interface; o conteúdo editorial (aulas, feedback, protocolo) está em português
  nesta versão.

## Produto

- O app não substitui fonoaudiologia, nem avalia saúde vocal.
- Não há plano de treino personalizado por machine learning; a recomendação é heurística sobre o seu
  histórico (última prática, metas não cumpridas, módulos incompletos).
- Progresso é limitado a 500 sessões e 300 entradas de diário (rotativo, mais antigas saem).
- Gravações limitadas a 12 minutos cada.

## Conhecidos e aceitos

- `style-src 'unsafe-inline'` na CSP: necessário porque o React escreve estilos inline em vários
  componentes. `script-src` continua restrito a `'self'`.
- A chave de criptografia fica acessível ao processo principal em memória durante a execução —
  inerente a qualquer app que cifra localmente sem senha mestra.
