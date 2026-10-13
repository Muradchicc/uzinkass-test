# Uzinkass — xodimlar uchun test sinovi

React (frontend) + Express (backend). Savollar Google Sheets'dan olinadi, har bir list — bitta bo'lim.
Har bir testda barcha bo'limlardan aralash holda jami 10 ta savol tushadi.

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

## Google Sheets'ga ulash (Apps Script)

1. Jadvalda **Extensions → Apps Script** oching, `apps-script/Code.gs` dagi kodni joylang. Yonida `Token` nomli yana bir fayl ochib, unga `const TOKEN = 'maxfiy-soz';` qatorini yozing.
2. Formaga bog'langan javoblar listi savol sifatida o'qilmaydi.
3. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*.
4. `server/.env.example` dan `server/.env` nusxa oling, `APPS_SCRIPT_URL` ga `/exec` havolasini, `APPS_SCRIPT_TOKEN` ga o'sha maxfiy so'zni yozing.
5. Serverni qayta ishga tushiring.

`Code.gs` o'zgartirilsa, **Deploy → Manage deployments → Edit → New version** qilish kerak.

## Natijalar

- Lokal tarmoqdan topshirilgan testlar jadvalning **Natijalar** listiga yoziladi ("Manba" ustuni — `Lokal tarmoq`).
- Google Forms javoblari ham **Natijalar** listiga yoziladi ("Manba" — `Google Forms`). Buning uchun:
  1. Formani shu jadvalga bog'lang (Forms → Responses → Link to Sheets → shu jadvalni tanlang).
  2. Apps Script muharririda `setupFormTrigger` funksiyasini bir marta ishga tushiring.
  3. Formadagi savol sarlavhasi listdagi "Savol" matni bilan, variantlar esa A–D ustunlaridagi matn bilan aynan bir xil bo'lsin — javoblar shu bo'yicha baholanadi.
  4. F.I.SH savolining sarlavhasida "F.I.SH", lavozim savolida "Lavozim" so'zi bo'lsin.
- Internet uzilsa natijalar `server/data/pending.json` da navbatda turadi va aloqa tiklanganda avtomatik yuboriladi.
  Barcha natijalarning zaxira nusxasi `server/data/results.json` da saqlanadi.

## Sozlamalar (`server/.env`)

| O'zgaruvchi | Ma'nosi | Standart |
|---|---|---|
| `APPS_SCRIPT_URL` | Apps Script Web App havolasi | bo'sh (fake data) |
| `APPS_SCRIPT_TOKEN` | `Code.gs` dagi `TOKEN` | — |
| `PORT` | Server porti | 80 |
| `QUESTION_COUNT` | Testdagi savollar soni | 10 |

## Serverni boshqa kompyuterga o'rnatish

1. Loyihani ko'chiring (GitHub'dan ZIP) va eski kompyuterdagi `server\.env` faylini `server\` papkasiga qo'ying.
2. Administrator PowerShell'da, loyiha papkasida:
   ```
   powershell -ExecutionPolicy Bypass -File .\install-server.ps1
   ```

Skript Node.js'ni o'rnatadi (bo'lmasa), frontendni yig'adi, firewall'da portni ochadi va serverni
kompyuter yonganda o'zi ishga tushadigan qiladi ("Uzinkass test" nomli Task Scheduler vazifasi).
