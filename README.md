# Uzinkass — xodimlar uchun test sinovi

React (frontend) + Express (backend). Savollar Google Sheets'dan olinadi, har bir list — bitta bo'lim.
Xodim hudud, F.I.SH va yo'nalishni kiritadi; yo'nalishga biriktirilgan bo'limlardan aralash holda savollar tushadi.
Har bir savolga 1 daqiqa hisobidan umumiy vaqt beriladi, vaqt tugasa test yakunlanadi.

Yo'nalish **so'rovnoma** turida ham bo'lishi mumkin: unda to'g'ri javob yo'q, baho qo'yilmaydi,
belgilangan bo'limlarning barcha savollari jadvaldagi tartibda, vaqt cheklovisiz beriladi.

## Ishga tushirish

```
npm run setup    # bir marta: kutubxonalarni o'rnatadi va frontendni yig'adi
npm start        # serverni ishga tushiradi
```

Server ishga tushganda konsolda `Lokal tarmoqda: http://192.168.x.x` havolasi chiqadi —
lokal tarmoqdagi kompyuterlarda shu havola ochiladi. Boshqa kompyuterlardan ochilmasa,
Windows Firewall'da 80-portga ruxsat bering.

`server/.env` bo'lmasa server `server/fake-data.json` dagi sinov savollari bilan ishlaydi.

## Internet orqali kirish (GitHub Pages)

Internetdagi sahifa GitHub Pages'da turadi va serversiz, to'g'ridan-to'g'ri Apps Script bilan ishlaydi:
savollarni Apps Script tanlaydi, javoblarni ham o'zi baholab **Natijalar** listiga yozadi ("Manba" — `Internet`).
Lokal tarmoq esa shu kompyuterdagi server orqali ishlaydi ("Manba" — `Lokal tarmoq`). Ikkalasi bitta jadvalga yozadi.

- `main` tarmog'iga har bir `git push` sahifani avtomatik yangilaydi (`.github/workflows/pages.yml`).
- Bir marta: GitHub'da **Settings → Pages → Source: GitHub Actions** ni tanlang.
- Apps Script havolasi o'zgarsa, uni `.github/workflows/pages.yml` da ham yangilang.

Vaqtinchalik muqobil: `npm run tunnel` lokal serverni Cloudflare orqali internetga chiqaradi (havola har safar o'zgaradi).

## Google Sheets jadvali

Har bir bo'lim uchun alohida list, 1-qator — sarlavha:

| Savol | A | B | C | D | To'g'ri javob |
|-------|---|---|---|---|---------------|

"To'g'ri javob" ustuniga `A`/`B`/`C`/`D` harfi, `1`–`4` raqami yoki to'g'ri variantning matni yoziladi.
Nomi `_` bilan boshlanadigan listlar savol sifatida o'qilmaydi.

- **Test savoli** — to'rtala variant va to'g'ri javob to'ldirilgan.
- **So'rovnoma savoli** — to'g'ri javob shart emas: 2–4 ta variant (xodim bittasini tanlaydi) yoki
  variantlar umuman bo'sh (xodim javobni o'zi yozadi). Bunday savollar faqat so'rovnomaga tushadi.
- Test savoli so'rovnomaga ham tushishi mumkin (to'g'ri javob e'tiborga olinmaydi).

## Hududlar, yo'nalishlar va sozlamalar

Jadvaldagi `_Sozlamalar` listida turadi (list bo'lmasa Apps Script uni birinchi murojaatda o'zi yaratadi):

| A — Hududlar | B — Yo'nalishlar | C — Yo'nalish listlari | D — Turi | E — Sozlama | F — Qiymat |
|---|---|---|---|---|---|
| Toshkent shahri | Inkassator | Xavfsizlik, Inkassatsiya qoidalari | Test | Savollar soni | 10 |
| Andijon viloyati | Xodimlar fikri | Ish sharoiti | So'rovnoma | Bir savolga vaqt (soniya) | 60 |

- **C ustuni** — shu yo'nalishdagi xodimga qaysi listlardan savol tushishi (vergul bilan). Testda bo'sh bo'lsa barcha listlardan tushadi;
  so'rovnomaga kamida bitta list ko'rsatiladi, savollar shu listlar tartibida beriladi.
- **D ustuni** — `Test` (yoki bo'sh) yoki `So'rovnoma`. Eski jadvallarda D bo'sh — barcha yo'nalishlar test hisoblanadi.
- Umumiy vaqt = savollar soni × bir savolga vaqt (faqat testda). Javobsiz qolgan savollar xato hisoblanadi.
- Ustun bo'sh qolsa standart qiymatlar ishlatiladi: 14 ta hudud, har bir list alohida yo'nalish, 10 ta savol, 60 soniya.
- O'zgarishlar internet sahifasida darhol, lokal serverda 5 daqiqa ichida kuchga kiradi.

## Google Sheets'ga ulash (Apps Script)

1. Jadvalda **Extensions → Apps Script** oching, `apps-script/Code.gs` dagi kodni joylang. Yonida `Token` nomli yana bir fayl ochib, unga `const TOKEN = 'maxfiy-soz';` qatorini yozing.
2. Formaga bog'langan javoblar listi savol sifatida o'qilmaydi.
3. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*.
4. `server/.env.example` dan `server/.env` nusxa oling, `APPS_SCRIPT_URL` ga `/exec` havolasini, `APPS_SCRIPT_TOKEN` ga o'sha maxfiy so'zni yozing.
5. Serverni qayta ishga tushiring.

`Code.gs` o'zgartirilsa, **Deploy → Manage deployments → Edit → New version** qilish kerak.

## Admin panel

Manzil: lokal tarmoqda `http://<server>/admin`, internetda `.../admin.html`.
Panelda: test parametrlari (savollar soni, vaqt); hududlar — qo'shish, o'chirish, tartibini o'zgartirish;
bo'limlar (listlar) — qo'shish, qayta nomlash, arxivga o'tkazish va arxivdan qaytarish; yo'nalishlar — turi
(test yoki so'rovnoma) va listlari; savollarni qo'shish/tahrirlash/o'chirish; test natijalari va so'rovnoma
javoblarini ko'rish (so'rovnoma bo'yicha savollar kesimida xulosa) va Excel (CSV) ga yuklab olish;
bosh sahifa matnlari (lotin va kirill); login/parolni o'zgartirish.
Barcha o'zgarishlar to'g'ridan-to'g'ri Google Sheets jadvaliga yoziladi (sayt matnlari — `_Matnlar` listiga).

**So'rovnoma** bo'limida so'rovnoma tanlanadi yoki yangisi yaratiladi (shu nomli list va "So'rovnoma" turidagi
yo'nalish birga yaratiladi), savollari qo'shiladi, tahrirlanadi va o'chiriladi. Savol turi: **Variantli (test)** —
2–4 ta variant, to'g'ri javobsiz; **Yozma** — xodim javobni o'zi yozadi.

Bo'lim o'chirilmaydi, balki arxivga o'tadi: list `_Arxiv <sana> <nom>` deb qayta nomlanadi, savollari jadvalda qoladi.
Bo'lim qayta nomlanganda yo'nalishlardagi nomi ham avtomatik yangilanadi.

Birinchi kirish uchun Apps Script'dagi `Token` fayliga qo'shing:

```js
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'kuchli-parol';
```

Paneldagi **Parol** bo'limida login/parol o'zgartirilsa, yangisi Script Properties'da (xesh ko'rinishida) saqlanadi
va `Token` faylidagi qiymat endi ishlatilmaydi. 5 marta xato kiritilsa, kirish 15 daqiqaga yopiladi.
Parolni unutsangiz: Apps Script → **Project Settings → Script Properties** dan `ADMIN_HASH` ni o'chiring —
yana `Token` faylidagi parol ishlaydi.

## Natijalar

- Barcha natijalar jadvalning **Natijalar** listiga yoziladi. Ustunlar: sana, hudud, F.I.SH, yo'nalish, to'g'ri javoblar, jami, foiz, bo'limlar bo'yicha, davomiyligi, manba (`Lokal tarmoq` yoki `Internet`).
- Ustunlari eski tartibdagi **Natijalar** listi o'chirilmaydi: `_Natijalar eski …` deb nomlanib, yangisi ochiladi.
- Xodimga xato javoblari ko'rsatiladi, lekin to'g'ri javob ko'rsatilmaydi.
- Google Forms javoblari ham **Natijalar** listiga yoziladi ("Manba" — `Google Forms`). Buning uchun:
  1. Formani shu jadvalga bog'lang (Forms → Responses → Link to Sheets → shu jadvalni tanlang).
  2. Apps Script muharririda `setupFormTrigger` funksiyasini bir marta ishga tushiring.
  3. Formadagi savol sarlavhasi listdagi "Savol" matni bilan, variantlar esa A–D ustunlaridagi matn bilan aynan bir xil bo'lsin — javoblar shu bo'yicha baholanadi.
  4. F.I.SH savolining sarlavhasida "F.I.SH", lavozim savolida "Lavozim" so'zi bo'lsin.
- So'rovnoma javoblari **So'rovnoma javoblari** listiga yoziladi — har bir javob alohida qator:
  sana, hudud, F.I.SH, yo'nalish, bo'lim, savol, javob, manba.
- Internet uzilsa natijalar va so'rovnoma javoblari `server/data/pending.json` da navbatda turadi va aloqa tiklanganda
  avtomatik yuboriladi. Zaxira nusxalari: test natijalari — `server/data/results.json`, so'rovnomalar — `server/data/surveys.json`.

## Sozlamalar (`server/.env`)

| O'zgaruvchi | Ma'nosi | Standart |
|---|---|---|
| `APPS_SCRIPT_URL` | Apps Script Web App havolasi | bo'sh (fake data) |
| `APPS_SCRIPT_TOKEN` | `Code.gs` dagi `TOKEN` | — |
| `PORT` | Server porti | 80 |
| `HTTPS_REDIRECT_PORT` | `https://` so'rovlarini `http://` ga yo'naltiruvchi port (0 — o'chirilgan) | 443 |
| `QUESTION_COUNT` | Savollar soni (`_Sozlamalar` da ko'rsatilmagan bo'lsa) | 10 |
| `SECONDS_PER_QUESTION` | Bir savolga vaqt, soniya (`_Sozlamalar` da ko'rsatilmagan bo'lsa) | 60 |

## Serverni boshqa kompyuterga o'rnatish

1. Loyihani ko'chiring (GitHub'dan ZIP) va eski kompyuterdagi `server\.env` faylini `server\` papkasiga qo'ying.
2. Administrator PowerShell'da, loyiha papkasida:
   ```
   powershell -ExecutionPolicy Bypass -File .\install-server.ps1
   ```

Skript Node.js'ni o'rnatadi (bo'lmasa), frontendni yig'adi, firewall'da portni ochadi va serverni
kompyuter yonganda o'zi ishga tushadigan qiladi ("Uzinkass test" nomli Task Scheduler vazifasi).

## https:// → http:// yo'naltirish

Server 443-portda ham tinglaydi va `https://SERVER` so'rovlarini `http://SERVER` ga yo'naltiradi.
Sertifikat server tomonidan o'zi yaratiladi, shuning uchun brauzer ogohlantirish ko'rsatadi.
Ogohlantirishsiz, to'g'ridan-to'g'ri o'tishi uchun har bir mijoz kompyuterda **bir marta**,
administrator buyruq oynasida:

```
curl -o %TEMP%\uzinkass.cer http://10.0.57.208/uzinkass-cert.cer && certutil -addstore -f Root %TEMP%\uzinkass.cer
```

(yoki `trust-https.cmd 10.0.57.208`). Keyin brauzerni yopib qayta oching. Firefox o'z sertifikat
omboridan foydalanadi — unda `about:config` da `security.enterprise_roots.enabled` ni `true` qiling.

## Serverdagi kodni yangilash

Server kompyuterida, administrator PowerShell'da:

```
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; irm https://raw.githubusercontent.com/Muradchicc/uzinkass-test/main/update-server.ps1 | iex
```

Skript GitHub'dan oxirgi versiyani yuklab, o'rnatilgan papka ustiga ko'chiradi (`server\.env` saqlanadi) va serverni qayta ishga tushiradi.
