# Хэмнэл — хувийн цаг төлөвлөгч

Өдрийн бүх ажлаа хугацаа, эрэмбээр нь төлөвлөх веб. Ажил бүр «Яаралтай × Чухал» матрицын аль нэг бүлэгт (Q1–Q4) орж, хугацаа дуусахад 48 цагаас бага үлдвэл автоматаар яаралтай болно.

## Хувилбар 1 (MVP)

- Бүртгүүлэх, нэвтрэх
- Ажил нэмэх, засах, устгах, дууссан гэж тэмдэглэх
- Квадрант (Q1–Q4) автоматаар тооцох
- «Өнөөдөр» хуудас: хоцорсон, өнөөдрийн (эрэмбээр), удахгүй, дууссан ажлууд
- Цагийн хуваарь (06:00–24:00), цаг давхцвал анхааруулна
- Light / Dark горим, утас ба компьютерт тохирсон

## Технологи

HTML, CSS, JavaScript · Supabase (Auth, PostgreSQL, RLS) · Vercel

## Ажиллуулах

1. supabase.com дээр шинэ төсөл үүсгэнэ.
2. **SQL Editor** дээр `supabase/schema.sql`-ийг бүхэлд нь хуулж **Run** дарна.
3. **Project Settings → API** хэсгээс Project URL болон publishable key-г хуулж `js/config.js`-д бичнэ.
4. **Authentication → URL Configuration** хэсэгт:
   - Site URL: `http://127.0.0.1:5500` (Live Server), дараа нь Vercel-ийн линк
   - Redirect URLs: `http://127.0.0.1:5500/**` ба `https://<таны-сайт>.vercel.app/**`
5. VS Code дээр `index.html` → **Open with Live Server**.

## Бүтэц

```
index.html
css/style.css
js/config.js         Supabase-ийн тохиргоо
js/app.js            програмын логик
supabase/schema.sql  хүснэгт, RLS, trigger
docs/screenshots/
```
