# APK Android (instalação direta)

Arquivo: `android/build/ASU2D-1.0.apk` (gerado por `bash android/build_apk.sh`, ~11,8 MB). É um app nativo mínimo (uma `Activity` com WebView em tela cheia) que traz o jogo **dentro do APK**: abre sem internet, e os dados (carreiras, saves) ficam no armazenamento privado do app (não são apagados como os de um site).

## Instalar no celular
1. Copie o `.apk` para o celular (cabo, Drive, WhatsApp…).
2. Abra o arquivo. O Android pedirá para **permitir instalar de fontes desconhecidas** para o app que você usou para abrir (Arquivos/Chrome): permita.
3. Instale e abra **ASU 2D**.
Ou por cabo: `adb install -r ASU2D-1.0.apk`.

## O que funciona de forma diferente da versão web
* O jogo é servido por um endereço interno (`https://appassets.asu.local/`) e **não usa o service worker** (os arquivos já estão no APK).
* **Backup / exportar:** o WebView não baixa arquivos; o app usa a janela "Salvar como" do Android (Menu 🔊 → Exportar tudo; exportar carreira). **Importar** abre o seletor de arquivos do Android.
* Links externos abrem no navegador do celular. Fotos/logotipos que vêm da internet precisam de conexão; o resto funciona offline.
* Depuração: o WebView aceita inspeção remota (`chrome://inspect` no PC com o celular por USB) — útil para medir fps (menu 🔊 → Mostrar FPS).

## Limites desta versão (leia)
* **Não foi testado em aparelho nem em emulador** (o ambiente de build não tem Android). Foi verificado: pacote íntegro (`aapt dump badging`), assinatura v1/v2/v3 válida (`apksigner verify`), e os arquivos embutidos rodam o jogo (smoke no navegador sobre os assets extraídos do APK: 32/33; a única falha é o `sw.js`, que de propósito não vai no APK).
* **Assinado com chave de debug** (`android/asu-debug.keystore`, senha pública `android`). Serve para instalar e atualizar entre builds, **não** para a Play Store.
* `targetSdkVersion 30`, `minSdk 23` (Android 6+). A Play Store exige hoje um target mais novo (34+): para publicar, abra a pasta `android/` no Android Studio (ou converta para Gradle), suba o target, use sua chave de assinatura (upload key) e gere o AAB. Também são necessárias política de privacidade e a revisão de direitos em `docs/LANCAMENTO.md`.
* Ícone simples (PNG), sem versão "adaptativa" do Android 8+: pode aparecer com uma moldura quadrada em alguns launchers.

## Reconstruir
```
apt install aapt apksigner zipalign dalvik-exchange libandroid-23-java openjdk-21-jdk-headless rsync python3-pil
bash android/build_apk.sh        # sem Android SDK nem Gradle; usa só pacotes do Ubuntu
```
Altere `versionCode/versionName` em `android/AndroidManifest.xml` a cada versão nova.
