// «Аврора» — фірмовий фон проєкту: мʼякі кольорові світіння, як на сайті
// (body::before у src/index.css). Одні й ті самі кольори/позиції для всіх
// карток Instagram і Telegram, щоб стрічка виглядала єдиним стилем.
//
// Використання у SVG-генераторі:
//   <svg ...>${AURORA_DEFS}
//     <rect .../фон і панель/>
//     ${AURORA_RECTS}   ← одразу ПІСЛЯ панелі, ПЕРЕД текстом
//     ...текст...
//
// Прозорості низькі, тож на контраст тексту шар майже не впливає
// (перевірено на сайті: WCAG-запас у кольорів великий).

export const AURORA_DEFS = `<defs>
  <radialGradient id="aur-teal" cx="15%" cy="-12%" r="80%">
    <stop offset="0%" stop-color="#00d2aa" stop-opacity="0.16"/>
    <stop offset="55%" stop-color="#00d2aa" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="aur-blue" cx="92%" cy="112%" r="75%">
    <stop offset="0%" stop-color="#00aaff" stop-opacity="0.13"/>
    <stop offset="58%" stop-color="#00aaff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="aur-purple" cx="75%" cy="25%" r="55%">
    <stop offset="0%" stop-color="#aa88ff" stop-opacity="0.09"/>
    <stop offset="60%" stop-color="#aa88ff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="aur-teal2" cx="30%" cy="85%" r="50%">
    <stop offset="0%" stop-color="#00d2aa" stop-opacity="0.06"/>
    <stop offset="60%" stop-color="#00d2aa" stop-opacity="0"/>
  </radialGradient>
</defs>`;

export const AURORA_RECTS = `<rect width="100%" height="100%" fill="url(#aur-teal)"/>
  <rect width="100%" height="100%" fill="url(#aur-blue)"/>
  <rect width="100%" height="100%" fill="url(#aur-purple)"/>
  <rect width="100%" height="100%" fill="url(#aur-teal2)"/>`;
