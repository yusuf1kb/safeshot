# Safeshot — Bilgileri Gizle

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
- **Format:** Orijinal tür, PNG, JPEG, WebP veya PDF. **Kalite** yalnızca kayıp (JPEG/WebP/TIFF/AVIF) formatlarda görünür; PNG ve PDF kayıpsızdır.
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
electron/
  main.js            pencere, IPC, CLI (--open), tek örnek kilidi
  preload.js         güvenli köprü (contextBridge)
  registry.js        sağ tık menüsü kaydı (HKCU)
  image/export.js    bulanıklaştırma / pikselleştirme / karartma + PNG/JPEG/WebP/PDF
renderer/            arayüz (canvas önizleme, alan listesi, dışa aktarma)
```

## Lisans

MIT. Görüntü işleme: sharp, PDF: pdf-lib.
