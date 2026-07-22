// Збір новин паливного ринку: українські RSS + світові енергетичні стрічки
// (англомовні перекладаються українською). Без залежностей: regex-парсер RSS,
// фільтри за ключовими словами, переклад — безкоштовний endpoint Google Translate.

const FEEDS = [
  { url: 'https://epravda.com.ua/rss/', source: 'Економічна правда' },
  { url: 'https://rss.unian.net/site/news_ukr.rss', source: 'УНІАН' },
  { url: 'https://www.ukrinform.ua/rss/rubric-economy', source: 'Укрінформ' },
  { url: 'https://www.rbc.ua/static/rss/all.ukr.rss.xml', source: 'РБК-Україна' },
  // світові (en → переклад uk)
  { url: 'https://oilprice.com/rss/main', source: 'OilPrice', lang: 'en' },
  { url: 'https://www.worldoil.com/rss?feed=news', source: 'World Oil', lang: 'en' },
  { url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx', source: 'Rigzone', lang: 'en' },
  { url: 'https://www.eia.gov/rss/todayinenergy.xml', source: 'EIA', lang: 'en' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC', lang: 'en' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', lang: 'en' },
];

// Тематичний фільтр для англомовних стрічок (до перекладу)
const EN_TOPIC = /\b(oil|crude|brent|opec|diesel|gasoline|petrol|fuel|refiner\w*|tanker|pipeline|lng|energy price|sanction\w*\s+(on\s+)?(russia|oil|iran)|embargo)\b/i;

// максимум перекладів з однієї світової стрічки за запуск (захист від флуду)
const MAX_PER_EN_FEED = 5;

/** Безкоштовний переклад en→uk; при збої повертає оригінал */
async function translateUk(text) {
  if (!text) return text;
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uk&dt=t&q=' +
      encodeURIComponent(text.slice(0, 800));
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const out = (data?.[0] ?? []).map(seg => seg?.[0] ?? '').join('').trim();
    return out || text;
  } catch {
    return text;
  }
}

// Новина потрапляє у стрічку, лише якщо стосується паливного ринку.
// «пальн»/«палив» — лише на початку слова, інакше ловиться «куПАЛЬНик», «сПАЛИВ» тощо.
const TOPIC = /дизел|дизпалив|(?<![а-яіїєґА-ЯІЇЄҐ])пальн|(?<![а-яіїєґА-ЯІЇЄҐ])палив|бензин|нафт|азс|нпз|brent|брент|опек|opec|акциз|автогаз|заправк|окко|\bwog\b|укрнафт|socar|перероб|імпорт.{0,20}(нафт|палив|пальн)|танкер|(курс|девальвац).{0,30}(грив|долар)|санкці.{0,40}(нафт|рф|танкер)/i;

// Чинники ймовірного зростання ціни (для споживача — негатив)
const UP = /подорожч|здорожчал|підстрибнул|зростання цін|піднял|піднім|зрост.{0,25}(цін|варт)|цін[аи]?[^.]{0,30}зроста|нафт[а-я]*\s+(зроста|дорожча)|підвищ.{0,20}(цін|акциз)|акциз|девальвац|послаб.{0,15}гривн|обстріл|удар|дефіцит|немає запасів|виснаж.{0,20}запас|скороч.{0,25}(імпорт|постач|видобут)|перебо.{0,15}постач|зупин.{0,25}(нпз|завод)|ремонт.{0,20}нпз|ембарго|мит[ао]|напад|атак|загострення|подола.{0,20}позначк/i;

// Чинники ймовірного зниження ціни (позитив)
const DOWN = /здешев|подешевш|знижен.{0,15}цін|падіння цін|впали|цін[аи]?[^.]{0,30}(пада|знижу)|нафт[а-я]*\s+(дешевша|пада)|зниж.{0,20}акциз|зміцнення гривн|надлишок|профіцит|збільш.{0,25}(імпорт|постач|видобут)|відновл.{0,25}(нпз|постач)|opec\+?.{0,40}збільш|знижк/i;

// Внутрішні справи РФ (дефіцит у Москві, Кремль тощо) — не наша тема.
// Але новини про Україну, де РФ згадується як агресор (удари, атаки), лишаємо.
const RF_INTERNAL = /москв|кремл|сибір|у\s+росії|в\s+росії|у\s+рф|в\s+рф|росія\s+(рятує|перенаправляє|збільшує|скорочує)|російськ\w*\s+(влада|уряд|регіон)/i;
const UA_MARKERS = /україн|харків|одес|київ|львів|дніпр|запоріж|микола|херсон|зсу|наш[іа]/i;

function isRfInternal(title, summary) {
  // тему новини визначає заголовок: якщо він про внутрішні справи РФ — відсікаємо,
  // навіть коли у тексті згадується Україна як контекст («через війну в Україні»)
  if (RF_INTERNAL.test(title)) return !UA_MARKERS.test(title);
  const text = `${title} ${summary}`;
  return RF_INTERNAL.test(text) && !UA_MARKERS.test(text);
}

function strip(s) {
  let t = s.replace(/<!\[CDATA\[|\]\]>/g, '');
  // спершу розкодовуємо подвійно закодовані теги (&lt;p&gt; → <p>), потім зрізаємо їх
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
      .replace(/&amp;/g, '&');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function tag(item, name) {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
}

export function classifyImpact(text) {
  const up = UP.test(text);
  const down = DOWN.test(text);
  if (up && !down) return 'up';    // 🔴 тисне на ціну вгору
  if (down && !up) return 'down';  // 🟢 тисне на ціну вниз
  return 'neutral';                // 🟡
}

export async function collectNews({ limit = 30 } = {}) {
  const items = [];
  const errors = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      let translated = 0;
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const item = m[1];
        let title = tag(item, 'title');
        let description = tag(item, 'description').slice(0, 300);
        const link = tag(item, 'link');
        const pub = tag(item, 'pubDate');

        if (feed.lang === 'en') {
          // світова стрічка: тематичний фільтр англійською, потім переклад
          if (!EN_TOPIC.test(`${title} ${description}`)) continue;
          if (translated >= MAX_PER_EN_FEED) continue;
          title = await translateUk(title);
          description = await translateUk(description);
          translated++;
        }

        const text = `${title} ${description}`;
        if (feed.lang !== 'en' && !TOPIC.test(text)) continue;
        if (isRfInternal(title, description)) continue;
        const date = pub ? new Date(pub) : null;
        items.push({
          title,
          summary: description,
          url: link,
          source: feed.source,
          publishedAt: date && !isNaN(date) ? date.toISOString() : null,
          impact: classifyImpact(text),
        });
      }
    } catch (e) {
      errors.push(`${feed.source}: ${e.message}`);
    }
  }
  // новіші вгорі, дедуп за заголовком
  const seen = new Set();
  const unique = items
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .filter(i => {
      const k = i.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
  return { items: unique, errors };
}
