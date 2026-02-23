# Samir - Twilight Glassmorphism Design System

> مرجع موحد لجميع أنماط وأكواد التصميم المستخدمة في واجهة Samir

---

## 1. من `src/index.css` – الأنماط العامة والألوان

```css
/* ========== Twilight Palette ========== */
:root {
  --twilight-deep: #020617;
  --twilight-glow-purple: #1e1b4b;
  --twilight-glow-blue: #1e3a8a;
  --twilight-bubble-ai: #1e293b;
  --twilight-user-from: #7c3aed;
  --twilight-user-to: #2563eb;
  --twilight-text-primary: #ffffff;
  --twilight-text-secondary: #94a3b8;
  
  font-family: 'Inter', system-ui, sans-serif;
  color-scheme: dark;
}

/* الخلفية الكونية */
body {
  background: radial-gradient(ellipse 120% 100% at 50% 50%, #020617 0%, #0f172a 35%, #1e1b4b 70%, #1e3a8a 100%);
}

/* Blur Blobs */
body::before {
  background: rgba(124, 58, 237, 0.2);
  filter: blur(100px);
}
body::after {
  background: rgba(37, 99, 235, 0.2);
  filter: blur(100px);
}

/* العناوين المتوهجة */
.heading-glow {
  color: #c4b5fd;
  text-shadow: 0 0 20px rgba(196, 181, 253, 0.4);
}

/* منطقة التمرير */
.chat-scroll-area {
  scroll-behavior: smooth;
  overflow-y: auto;
}
```

---

## 2. من `src/App.jsx` – الهيدر والتنقل والفوتر

### الهيدر (Header)
```jsx
<header className="bg-white/[0.08] backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.2)] p-6 flex justify-between items-center sticky top-0 z-40">
  <h1 className="text-2xl font-bold tracking-wide heading-glow">Samir - AI Tutor</h1>
  <div className="flex items-center gap-4">
    <select className="bg-white/5 backdrop-blur-md border border-white/10 p-2 rounded-lg text-white" />
    <div className="...">Online/Offline</div>
    <button className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10" />
    <button className="px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10">Sign Out</button>
  </div>
</header>
```

### شريط التنقل (Navbar)
```jsx
<nav className="flex justify-center p-4">
  <div className="flex gap-4 px-6 py-3 rounded-3xl bg-white/5 backdrop-blur-md border border-white/5">
    {/* Active */}
    <button className="text-white border-b-2 border-purple-500 bg-purple-500/20" />
    {/* Inactive */}
    <button className="text-[#94a3b8] hover:text-white hover:bg-white/10 hover:shadow-[0_0_15px_rgba(124,58,237,0.1)]" />
  </div>
</nav>
```

### الفوتر (Footer)
```jsx
<footer className="bg-white/[0.06] backdrop-blur-md py-6 px-4">
  <div className="flex items-center gap-6 text-[#94a3b8]">...</div>
</footer>
```

---

## 3. من `src/components/ChatInterface.jsx` – الدردشة

### الحاوية الرئيسية (Glass Container)
```jsx
<div style={{
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.8), 0 0 60px rgba(124, 58, 237, 0.08)'
}}>
```

### الهالة (Halo)
```jsx
<div className="absolute inset-0 -m-4 rounded-3xl bg-purple-500/10 blur-3xl -z-10" />
```

### منطقة الرفع
```jsx
<div className={`
  p-12 rounded-2xl
  ${isDragging ? 'bg-[#2563eb]/15 shadow-[0_0_50px_rgba(37,99,235,0.4)]' : 'bg-white/[0.04] hover:bg-white/[0.06]'}
`} />
```

### زر Choose File
```jsx
<button className="px-6 py-3 bg-gradient-to-r from-[#7c3aed] to-[#2563eb] hover:opacity-90 text-white rounded-xl shadow-[0_0_30px_rgba(124,58,237,0.3)]">
  Choose File
</button>
```

### فقاعة المستخدم (User Bubble)
```jsx
<div
  className="max-w-[85%] p-5 md:p-6 rounded-[24px] rounded-br-md"
  style={{
    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    boxShadow: '0 0 15px rgba(124, 58, 237, 0.4)'
  }}
>
  <p className="text-[#ffffff] leading-relaxed">...</p>
</div>
```

### فقاعة سمير (AI Bubble)
```jsx
<div className="max-w-[85%] p-5 md:p-6 rounded-[24px] rounded-bl-md bg-slate-900/40 backdrop-blur-md border border-white/5">
  <p className="text-[#cbd5e1] leading-relaxed">...</p>
</div>
```

### حاوية الرسائل
```jsx
<div className="flex flex-col gap-8">
  {/* الرسائل */}
</div>
```

### شريط الإدخال
```jsx
<input
  className="w-full py-3 px-4 text-white placeholder-[#64748b] bg-transparent rounded-lg"
  style={{
    borderBottom: isInputFocused ? '2px solid rgba(124, 58, 237, 0.8)' : '1px solid rgba(255,255,255,0.08)',
    boxShadow: isInputFocused ? '0 0 20px rgba(124, 58, 237, 0.15)' : 'none'
  }}
/>
```

### زر الإرسال
```jsx
<button
  className="w-12 h-12 rounded-full"
  style={{
    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    boxShadow: '0 0 20px rgba(124, 58, 237, 0.5)'
  }}
>
  {/* أيقونة السهم */}
</button>
```

---

## 4. لوحة الألوان السريعة

| الاستخدام | اللون / الكلاس |
|-----------|-----------------|
| خلفية أساسية | `#020617` |
| توهج بنفسجي | `#1e1b4b` |
| توهج أزرق | `#1e3a8a` |
| تدرج المستخدم | `#7c3aed` → `#2563eb` |
| نص أساسي | `#ffffff` |
| نص ثانوي | `#94a3b8` |
| نص سمير | `#cbd5e1` |
| زجاج خفيف | `bg-white/5` |
| زجاج عند المرور | `bg-white/10` |
| حدود زجاجية | `border-white/5` أو `border-white/10` |

---

## 5. الملفات المرجعية

- `src/index.css` — الأنماط العامة
- `src/App.jsx` — الهيدر، التنقل، الفوتر
- `src/components/ChatInterface.jsx` — واجهة الدردشة
