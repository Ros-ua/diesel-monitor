// Стрічка новин ринку пального (стиль фінансового терміналу)
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { timeAgo } from '../lib/format';
import type { NewsImpact } from '../types';

const IMPACT_ICON: Record<NewsImpact, string> = {
  up: '🔴',
  down: '🟢',
  neutral: '🟡',
};

export default function NewsWidget() {
  const { news } = useAppData();

  return (
    <motion.div
      className="card p-3 flex flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="lbl">
          НОВИНИ РИНКУ
          {news && news.items.length > 0 && (
            <span className="text-muted/70 ml-1.5">({news.items.length})</span>
          )}
        </div>
        <div className="text-[8px] text-muted whitespace-nowrap">
          🔴 тисне вгору · 🟢 вниз · 🟡 нейтрально
        </div>
      </div>

      {!news || news.items.length === 0 ? (
        <div className="text-muted text-xs py-4">Новини недоступні</div>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto">
          {news.items.map((item, i) => {
            const ago = timeAgo(item.publishedAt);
            return (
              <motion.div
                key={item.url + i}
                className="border-b border-line/50 py-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.03 }}
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] leading-4 shrink-0">
                    {IMPACT_ICON[item.impact]}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#e0ede9] hover:text-accent leading-4"
                  >
                    {item.title}
                  </a>
                </div>
                <div className="text-[10px] text-muted line-clamp-2 mt-0.5">
                  {item.summary}
                </div>
                <div className="text-[9px] text-muted/70 mt-0.5">
                  {item.source}
                  {ago ? ` · ${ago}` : ''}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="text-[9px] text-muted/60 mt-2">
        Автодобірка за ключовими словами · Економічна правда, УНІАН · архів накопичується
      </div>
    </motion.div>
  );
}
