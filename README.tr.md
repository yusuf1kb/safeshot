# Safeshot — Bilgileri Gizle

**Türkçe** · [English](README.md)

Fotoğrafta gizlemek istediğin yeri **kendin işaretlersin**; uygulama o alanı bulanıklaştırır, pikselleştirir veya istediğin renkle karartır. Tamamen çevrimdışı çalışır, hiçbir görsel bilgisayardan çıkmaz.

> Otomatik metin/numara tanıma (OCR) kaldırıldı. Uygulama artık tamamen manuel: sen çiziyorsun, yöntemi ve gücünü sen seçiyorsun.

## Özellikler

- **Windows sağ tık menüsü:** görsele sağ tık → **Bilgileri Gizle**. Uygulama açılır, görsel hazır gelir.
- **İki araç:** **Dikdörtgen** (sürükleyerek kutu çiz) veya **Serbest** (fareyle basılı tutup boyayarak şekilsiz alan çiz; fırça kalınlığı ayarlanır).
- **Alanı taşı / boyutlandır:** imleci alanın içine getir, basılı tutup sürükle; seçili dikdörtgen alanın **köşe tutamaçlarından** boyutunu değiştir.
- **Her alan kendi ayarını taşır:** yöntem (Bulanıklaştır / Pikselleştir / Karart), güç ve karartma rengi alan bazında saklanır — birini değiştirmek diğerlerini etkilemez.
  - Bir alan seçiliyken yaptığın değişiklik **sadece o alana** uygulanır.
  - Hiçbir alan seçili değilken (veya yeni çizmeden önce) yaptığın seçim, **çizeceğin yeni alanların varsayılanı** olur.
  - Güç aralıkları: Bulanıklaştır 0.2×–2.0×, Pikselleştir 0.2×–3.0×, Karart %40–%100 (opaklık).
  - **Bulanıklaştırma** gücü arttıkça görüntü belirgin biçimde daha çok yumuşar; düşük güç hafif, yüksek güç okunamaz hale getirir.
- **Önizleme birebir:** ekranda gördüğün sonuç kaydedilene eşittir.
- **Serbest çizim:** bıraktığın anda kalem hattı kaybolur, sadece gizlenen alan kalır.
- **Format:** Orijinal tür, PNG, JPEG, WebP veya PDF. Orijinal seçiliyken PNG/WebP kaynağı türünü korur, diğer kaynaklar (BMP, GIF, TIFF, AVIF, HEIC…) JPEG olarak yazılır. **Kalite** yalnızca kayıp (JPEG/WebP/TIFF/AVIF) formatlarda görünür; PNG ve PDF kayıpsızdır.
- **EXIF/GPS temizliği:** kaydedilen dosyada konum, cihaz, tarih gibi gizli meta veriler kalmaz.
- **Üzerine yazmaz:** `foto-gizli.jpg` adıyla, varsayılan olarak orijinalin yanına kaydeder.

## Kurulum

```powershell
npm install
npm start
```

İlk açılışta sağ tık menüsü kendiliğinden kurulur (yönetici izni gerekmez, `HKCU` altına yazar); ayrıca bir düğmeye basman gerekmez. Uygulamanın yolu değişirse (yeni sürüm, taşınan klasör) menü kaydı açılışta sessizce güncellenir.

Windows 11'de klasik menü girdileri **“Diğer seçenekler”** (Shift + F10) altında görünür.

## Tema

Sağ üstteki tema düğmesiyle dört tema arasında geçiş yapılır, seçim hatırlanır:

- **Gece** — varsayılan koyu lacivert
- **Gündüz** — açık, nötr mavi-gri
- **Grafit** — koyu gri + amber vurgu
- **Kum** — açık, sıcak krem tonları

## Kullanım

1. Görsele sağ tık → **Bilgileri Gizle** (veya “Fotoğraf aç” / sürükle-bırak).
2. Soldan aracı seç: **Dikdörtgen** ya da **Serbest**; gizlenecek yerin üzerinde fareyle basılı tutup sürükle.
3. Alanın içine basıp sürükleyerek **yerini değiştir**; seçili alanın köşe tutamaçlarından **boyutlandır**; sağdaki ✕ veya `Delete` ile sil.
4. Bir alanı seç (listeden ya da görselde tıkla), sonra **yöntemini, gücünü, rengini** ayarla — sadece o alan değişir.
5. **Kaydet**. Varsayılan ad `foto-gizli.<uzantı>`.

Kısayollar: `Ctrl+S` kaydet · `Ctrl+O` aç · `Ctrl+Z` geri al · `Delete` seçili alanı sil · `Esc` seçimi bırak.

## İpuçları

- Çok küçük alanlarda bulanıklık az kalabilir; gücü artır ya da **Karart** kullan.
- Pikselleştirme gücü yükseldikçe mozaik kabalaşır; düşük güçte yazı hâlâ seçilebilir.
- Kaydettikten sonra çıkan bildirime tıklarsan dosya klasörde gösterilir.

## Derleme

```powershell
npm run dist
```

`dist/` altında NSIS kurulum dosyası oluşur. Kurulum sağ tık menüsü girdilerini `HKCU` altına yazar, kaldırma temizler. Uygulama ikonu `build/icon.png` (1024×1024), kaynağı `build/icon.svg`.

## Mimari

```
safeshot/
├─ electron/               ana süreç (Node.js)
│  ├─ main.js              pencere, CLI (--open), IPC, tek örnek kilidi
│  ├─ preload.js           contextBridge ile açılan güvenli köprü
│  ├─ registry.js          sağ tık menüsü kaydı (HKCU)
│  └─ image/
│     └─ export.js         bulanıklaştırma / pikselleştirme / karartma + PNG, JPEG, WebP, PDF
├─ renderer/               arayüz — düz HTML/CSS/JS, derleyici yok
│  ├─ index.html           üst bar, kenar çubuğu, tuval sahnesi, dışa aktarma çubuğu
│  ├─ style.css            yerleşim, kontroller ve dört tema paleti
│  └─ app.js               tuval editörü, alan modeli, geçmiş, dışa aktarma
├─ build/                  paketleme dosyaları (uygulamanın içine girmez)
│  ├─ icon.svg             uygulama ikonunun vektör kaynağı
│  ├─ icon.png             1024×1024 ikon (kurulum + pencere)
│  └─ installer.nsh        NSIS kancaları: menü kaydını yaz / sil
├─ resources/
│  └─ icon.png             çalışma anında kullanılan ikon (pencere / görev çubuğu)
├─ package.json            betikler, bağımlılıklar, electron-builder ayarları
├─ README.md               İngilizce doküman
└─ README.tr.md            bu dosya (Türkçe)
```

### Dosyalar ne yapar

| Dosya | Görevi |
|---|---|
| `electron/main.js` | 1320×880 penceresini oluşturur (en küçük 940×620; context isolation açık, Node entegrasyonu kapalı). Tek örnek kilidini yönetir: ikinci kez açılırsa yeni pencere açmak yerine `--open <dosya>` argümanlarını çalışan pencereye iletir. `argv` içinden `--open` dosyalarını ayrıştırır, arayüz hazır olana kadar bekletir ve `open-files` kanalıyla gönderir. IPC işleyicilerini (`app:info`, `file:pick`, `file:info`, `export`, `export:pick`, `shell:*`, `folder:open`, `files:take`) kaydeder, her açılışta `registry.ensure()` ile sağ tık menüsü kaydını onarır ve `renderer/index.html` dosyasını yükler. Geliştirmeye özel `SAFESHOT_OPEN`, `SAFESHOT_SHOT`, `SAFESHOT_EVAL`, `SAFESHOT_LOG` ve `SAFESHOT_REG` kancaları da burada. |
| `electron/preload.js` | Sayfa ile ana süreç arasındaki tek köprü. `window.safeshot` altında `info`, `pickFiles`, `fileInfo`, `exportImage`, `pickExportPath`, `register`, `unregister`, `shellStatus`, `showInFolder`, `toFileUrl`, `pathForFile` (sürükle-bırak için), `onOpenFiles` ve `takePendingFiles` fonksiyonlarını açar. Node/Electron'un geri kalanı arayüze hiç görünmez. |
| `electron/registry.js` | Explorer girdisini `HKCU\Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle` altına yazar: etiket **Bilgileri Gizle**, ikon çalıştırılabilir dosyadan, `MultiSelectModel=Player`, komut `"<exe>" --open "%1"`. Hem geliştirme yolunu hem kurulu yolu bilir. `ensure()` kayıtlı komutu mevcut exe ile karşılaştırır, yalnızca farklıysa yeniden yazar; sürüm güncellemesi veya klasör taşıma kendiliğinden düzelir. Açma penceresinin ve kurulumun kullandığı desteklenen uzantı listesini (`EXTS`) de dışa aktarır. |
| `electron/image/export.js` | Tüm görüntü işleme (`sharp` + `pdf-lib`). `loadRaw()` dosyayı EXIF yönüne göre çevirip ham piksele okur (meta veriler bu adımda kaybolur); `pxBox()` normalize kutu koordinatlarını piksele çevirir; `shapeMask()` SVG maske üretir — dikdörtgen ya da yuvarlak uçlu çoklu çizgi, tek noktalı fırçada daire; `blurFactor()` / `pixelFactor()` gücü küçültme oranına eşler; `blurRegions()` her alanı kırpar, efekt parçasını üretir, maskeyi `dest-in` ile uygular ve hepsini taban görüntüye bindirir; `encodeFormat()` PNG / JPEG / WebP kodlamasını seçer; `toPdf()` sonucu tek sayfalık PDF'e sarar; `uniquePath()` üzerine yazmayı engeller; `exportImage()` bunları birleştirip yazılan yolu döndürür. |
| `renderer/index.html` | Arayüzün tamamı: üst bar (logo, dosya adı, tema düğmesi, **Fotoğraf aç**), kenar çubuğu (araç düğmeleri + fırça kalınlığı, üç yöntem kartı, güç kaydırıcısı, renk seçici, alan listesi, **Geri al** / **Temizle**), sahne (tuval, boş durum sürükle-bırak alanı, ilerleme katmanı), dışa aktarma çubuğu (format, kalite, **Farklı kaydet**, **Kaydet**) ve bildirim kabı. |
| `renderer/style.css` | Tüm görünüm: iki sütunlu yerleşim, tuval sunumu, düğmeler, kaydırıcılar, listeler ve bildirimler. Dört tema yalnızca CSS değişkeni olarak `:root[data-theme="gece\|gunduz\|grafit\|kum"]` altında tanımlı; tema değişimi `<html>` üzerindeki tek bir özniteliği değiştirir, yeniden çizim ya da ek kod gerekmez. |
| `renderer/app.js` | Editörün kendisi. Durumu tutar (`regions`, `selected`, `tool`, `brush`, `defaults`, `format`, `quality`, geçmiş yığını), görüntüyü ve efekt önizlemesini tuvale çizer, isabet testi, taşıma, köşeden boyutlandırma ve serbest çizim nokta toplama işlerini yapar, alan listesini ve seçim bilgisi satırını günceller, yöntem başına güç varsayılanlarını korur, geri alma anlık görüntülerini yönetir, klavye kısayollarını, tema döngüsünü ve `localStorage` tercihlerini işler, dışa aktarmada `exportImage`'ı alan verisiyle çağırır. |
| `build/icon.svg` | Uygulama ikonunun vektör kaynağı (üst bardaki işaret de bu). |
| `build/icon.png` | İkonun 1024×1024 raster hali; electron-builder exe ve kurulum için, geliştirmede pencere ikonu olarak kullanılır. |
| `build/installer.nsh` | İki NSIS makrosu: `customInstall` `$INSTDIR\Safeshot.exe` yolunu gösteren `HKCU` menü kaydını yazar, `customUnInstall` siler. |
| `resources/icon.png` | `BrowserWindow` ve görev çubuğu için çalışma anı ikonu; asar içinde paketlenir. |
| `package.json` | Proje bilgileri, `start` / `dist` betikleri, çalışma bağımlılıkları (`sharp`, `pdf-lib`), geliştirme bağımlılıkları (`electron`, `electron-builder`) ve electron-builder ayarları (NSIS hedefi, kullanıcı bazlı kurulum, kendi `build/` kaynak klasörü, ikon). |
| `.gitignore` | `node_modules/`, `dist/`, `out/`, log'lar ve dışa aktarılmış test görselleri repoya girmez. |


## Lisans

MIT. Görüntü işleme: sharp, PDF: pdf-lib.
