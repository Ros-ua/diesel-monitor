// Довідник мереж зарядки: перевірені посилання на сайт і застосунки + колір на карті.
// Посилання підтверджені (відкривались), null = власного застосунку немає.
export interface EvNetwork {
  name: string;
  color: string;
  website?: string;
  ios?: string;
  android?: string;
  note?: string;
}

// Ключі збігаються з нормалізованими net-значеннями збирача (canonicalNetwork).
export const EV_NETWORKS: Record<string, EvNetwork> = {
  Toka: {
    name: 'Toka',
    color: '#00d2aa',
    website: 'https://toka.energy',
    ios: 'https://apps.apple.com/ua/app/toka-network/id1320781993',
    android: 'https://play.google.com/store/apps/details?id=com.tokamobile.TokaApp',
    note: 'мережа швидких зарядок; нею заряджають OKKO та WOG',
  },
  Ecofactor: {
    name: 'Ecofactor',
    color: '#63c968',
    website: 'https://ecofactortech.com',
    ios: 'https://apps.apple.com/ua/app/ecofactor-ev-charging/id1438716797',
    android: 'https://play.google.com/store/apps/details?id=eu.ecofactor',
    note: 'найпоширеніша за кількістю сесій',
  },
  YASNO: {
    name: 'YASNO E-mobility',
    color: '#ffb347',
    website: 'https://yasno.com.ua/mobile-app',
    ios: 'https://apps.apple.com/ua/app/e-mobility-yasno/id1590869775',
    android: 'https://play.google.com/store/apps/details?id=ua.com.yasno.cp.app',
    note: 'швидкі зарядки від DTEK/YASNO (кол. STRUM)',
  },
  GoToU: {
    name: 'GO TO-U',
    color: '#aa88ff',
    website: 'https://goto-u.com',
    ios: 'https://apps.apple.com/ua/app/go-to-u-ev-charging-app/id1175538017',
    android: 'https://play.google.com/store/apps/details?id=com.go.tou',
    note: 'бронювання станцій; через неї — зарядки Porsche',
  },
  UGV: {
    name: 'UGV Chargers',
    color: '#c0a060',
    website: 'https://ugv.ua',
    ios: 'https://apps.apple.com/ua/app/ugv-chargers/id1438720281',
    android: 'https://play.google.com/store/apps/details?id=com.ugv.chargers.ua',
    note: 'український виробник і мережа',
  },
  EVA: {
    name: 'EVA Chargers',
    color: '#00aaff',
    website: 'https://www.evachargers.com/uk',
    ios: 'https://apps.apple.com/ua/app/eva-chargers/id6473438019',
    android: 'https://play.google.com/store/apps/details?id=com.energy.eva.chargers',
    note: '1000+ станцій, старт у два дотики',
  },
  WOG: {
    name: 'WOG CHARGE',
    color: '#ff8fb3',
    website: 'https://wog.ua',
    ios: 'https://apps.apple.com/ua/app/wog-pride/id1447353073',
    android: 'https://play.google.com/store/apps/details?id=d2.android.apps.wog',
    note: 'вбудовано в застосунок WOG PRIDE',
  },
  Ionity: {
    name: 'IONITY UA',
    color: '#5ad1e0',
    website: 'https://ionity.ua',
    note: 'заряджання через застосунок Ecofactor',
  },
  OKKO: {
    name: 'OKKO',
    color: '#f0997b',
    website: 'https://www.okko.ua/electric-chargers',
    note: 'ultra-fast на АЗК; зарядка через застосунок TOKA',
  },
  Faster: {
    name: 'Faster',
    color: '#ff5f5f',
    website: 'https://faster.in.ua',
    note: 'мережа швидких зарядних станцій',
  },
  Порше: {
    name: 'Porsche',
    color: '#d0d0d0',
    website:
      'https://www.porsche.com/international/aboutporsche/e-performance/charging-and-range/charging/charging-service/',
    note: 'поодинокі станції; доступ через GO TO-U',
  },
  Tesla: { name: 'Tesla', color: '#e24b4a', website: 'https://www.tesla.com/uk_ua/findus' },
};

export const EV_UNKNOWN_COLOR = '#5a7a72';

export const netColor = (net: string | null): string =>
  (net && EV_NETWORKS[net]?.color) || EV_UNKNOWN_COLOR;
