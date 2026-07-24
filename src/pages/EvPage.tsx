// Карта зарядних станцій електромобілів по Україні (агрегатор локацій з OSM).
// Ціни на зарядку не показуємо (немає джерела) — натомість ведемо до сайтів/
// застосунків мереж, де водій бачить актуальний тариф і запускає зарядку.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { EV_NETWORKS, netColor } from '../data/evNetworks';

interface Station {
  lat: number;
  lon: number;
  net: string | null;
  name: string | null;
  pw: number | null;
  sk: string[];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function popupHtml(s: Station): string {
  const net = s.net ? EV_NETWORKS[s.net] : null;
  const title = esc(s.name || s.net || 'Зарядна станція');
  const meta: string[] = [];
  if (s.net) meta.push(esc(s.net));
  if (s.pw) meta.push(`до ${s.pw} кВт`);
  if (s.sk.length) meta.push(esc(s.sk.join(', ')));
  // посилання мережі (де відомий оператор — сайт і застосунки для тарифу/запуску)
  const links: string[] = [];
  if (net?.website) links.push(`<a href="${net.website}" target="_blank" rel="noopener">сайт</a>`);
  if (net?.ios) links.push(`<a href="${net.ios}" target="_blank" rel="noopener">iOS</a>`);
  if (net?.android) links.push(`<a href="${net.android}" target="_blank" rel="noopener">Android</a>`);
  // перевірити саме місце: Google Maps покаже назву, фото, відгуки, чи працює
  const view = `<a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}" target="_blank" rel="noopener">на карті ↗</a>`;
  const nav = `<a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">маршрут ↗</a>`;
  return (
    `<div style="font-family:'Courier New',monospace;min-width:160px">` +
    `<div style="color:#00d2aa;font-weight:bold;font-size:13px;margin-bottom:3px">${title}</div>` +
    (meta.length ? `<div style="color:#5a7a72;font-size:11px;margin-bottom:5px">${meta.join(' · ')}</div>` : '') +
    (links.length
      ? `<div style="font-size:11px;margin-bottom:4px">${links.join(' · ')}</div>`
      : `<div style="color:#5a7a72;font-size:10px;margin-bottom:4px">мережу не вказано в OSM — перевірте місце ↓</div>`) +
    `<div style="font-size:11px">${view} · ${nav}</div>` +
    `</div>`
  );
}

export default function EvPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null); // обрана мережа або null=усі

  // завантаження станцій
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/ev-stations.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then(d => {
        setStations(d.stations ?? []);
        setUpdated(d.updated ?? null);
      })
      .catch(() => setStations([]));
  }, []);

  // ініціалізація карти (один раз)
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { center: [49.0, 31.5], zoom: 6, preferCanvas: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const shown = useMemo(
    () => (filter ? stations.filter(s => s.net === filter) : stations),
    [stations, filter]
  );

  // перемальовування маркерів при зміні даних/фільтра
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (!shown.length) return;
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      iconCreateFunction: c => {
        const n = c.getChildCount();
        return L.divIcon({
          html: `<div style="background:rgba(0,210,170,0.85);color:#0a0e12;border:1px solid #0a0e12;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-family:'Courier New',monospace;font-weight:bold;font-size:12px">${n}</div>`,
          className: '',
          iconSize: [34, 34],
        });
      },
    });
    for (const s of shown) {
      L.circleMarker([s.lat, s.lon], {
        radius: 6,
        fillColor: netColor(s.net),
        color: '#0a0e12',
        weight: 1,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(s))
        .addTo(cluster);
    }
    cluster.addTo(map);
    clusterRef.current = cluster;
  }, [shown]);

  // мережі з лічильником для легенди/фільтра
  const netCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of stations) if (s.net) m[s.net] = (m[s.net] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [stations]);

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <Link to="/" className="text-muted hover:text-accent text-xs no-underline">
          ← На головну
        </Link>
        <h2 className="text-xl text-accent font-bold uppercase tracking-wider mt-1.5">
          Зарядки для електромобілів
        </h2>
        <div className="text-[10px] text-muted mt-0.5">
          {stations.length} станцій по Україні · дані OpenStreetMap
          {updated ? ` · оновлено ${updated.slice(0, 10)}` : ''}
        </div>
      </div>

      {/* фільтр за мережею */}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`${filter === null ? 'btn' : 'btn btn-ghost'} px-2! py-0.5! text-[10px]!`}
        >
          Усі ({stations.length})
        </button>
        {netCounts.map(([net, n]) => (
          <button
            key={net}
            type="button"
            onClick={() => setFilter(f => (f === net ? null : net))}
            className={`${filter === net ? 'btn' : 'btn btn-ghost'} px-2! py-0.5! text-[10px]!`}
            style={filter === net ? undefined : { borderColor: netColor(net), color: netColor(net) }}
          >
            {net} ({n})
          </button>
        ))}
      </div>

      {/* карта */}
      <div className="card overflow-hidden" style={{ padding: 0 }}>
        <div ref={mapEl} style={{ height: '70vh', minHeight: 420, background: '#0a0e12' }} />
      </div>

      {/* довідник мереж із посиланнями */}
      <div className="card p-3">
        <div className="lbl mb-2">Мережі зарядок — сайти та застосунки</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {Object.values(EV_NETWORKS)
            .filter(n => n.website || n.ios || n.android)
            .map(n => (
              <div key={n.name} className="flex items-center gap-2 text-xs py-1 border-b border-line/40">
                <span className="inline-block size-2.5 rounded-full shrink-0" style={{ background: n.color }} />
                <span className="text-[#e0ede9] font-bold min-w-[70px]">{n.name}</span>
                <span className="text-muted text-[10px] flex-1 truncate">{n.note}</span>
                <span className="flex gap-2 text-[11px] shrink-0">
                  {n.website && <a href={n.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">сайт</a>}
                  {n.ios && <a href={n.ios} target="_blank" rel="noreferrer" className="text-accent hover:underline">iOS</a>}
                  {n.android && <a href={n.android} target="_blank" rel="noreferrer" className="text-accent hover:underline">Android</a>}
                </span>
              </div>
            ))}
        </div>
        <div className="text-[9px] text-muted/70 mt-2">
          Ціни на зарядку динамічні й залежать від станції та часу — точний тариф дивіться у застосунку мережі.
          Кольори точок відповідають мережі; сірі — оператора не вказано в OSM. Дані краудсорсингові (OpenStreetMap),
          можливі неточності — кнопка «на карті» у picker відкриває місце в Google Maps (назва, фото, чи працює).
        </div>
      </div>
    </div>
  );
}
