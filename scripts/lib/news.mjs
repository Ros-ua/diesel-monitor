// Збір новин паливного ринку з українських RSS-стрічок.
// Без залежностей: простий regex-парсер RSS + фільтр за ключовими словами.

const FEEDS = [
  { url: 'https://epravda.com.ua/rss/', source: 'Економічна правда' },
  { url: 'https://rss.unian.net/site/news_ukr.rss', source: 'УНІАН' },
];

// Новина потрапляє у стрічку, лише якщо стосується паливного ринку.
// «пальн»/«палив» — лише на початку слова, інакше ловиться «куПАЛЬНик», «сПАЛИВ» тощо.
const TOPIC = /дизел|дизпалив|(?<![а-яіїєґА-ЯІЇЄҐ])пальн|(?<![а-яіїєґА-ЯІЇЄҐ])палив|бензин|нафт|азс|нпз|brent|брент|опек|opec|акциз|автогаз|заправк|окко|\bwog\b|укрнафт|socar|перероб|імпорт.{0,20}(нафт|палив|пальн)|танкер|(курс|девальвац).{0,30}(грив|долар)|санкці.{0,40}(нафт|рф|танкер)/i;

// Чинники ймовірного зростання ціни (для споживача — негатив)
const UP = /подорожч|здорожчал|підстрибнул|зростання цін|піднял|піднім|зрост.{0,25}(цін|варт)|підвищ.{0,20}(цін|акциз)|акциз|девальвац|послаб.{0,15}гривн|обстріл|удар|дефіцит|немає запасів|виснаж.{0,20}запас|скороч.{0,25}(імпорт|постач|видобут)|перебо.{0,15}постач|зупин.{0,25}(нпз|завод)|ремонт.{0,20}нпз|ембарго|мит[ао]|напад|атак|загострення|подола.{0,20}позначк/i;

// Чинники ймовірного зниження ціни (позитив)
const DOWN = /здешев|подешевш|знижен.{0,15}цін|падіння цін|впали|зниж.{0,20}акциз|зміцнення гривн|надлишок|профіцит|збільш.{0,25}(імпорт|постач|видобут)|відновл.{0,25}(нпз|постач)|opec\+?.{0,40}збільш|знижк/i;

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
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const item = m[1];
        const title = tag(item, 'title');
        const description = tag(item, 'description').slice(0, 300);
        const link = tag(item, 'link');
        const pub = tag(item, 'pubDate');
        const text = `${title} ${description}`;
        if (!TOPIC.test(text)) continue;
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
