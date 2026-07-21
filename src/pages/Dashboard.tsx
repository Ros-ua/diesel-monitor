import FuelTickers from '../components/FuelTickers';
import PriceHero from '../components/PriceHero';
import PriceChart from '../components/PriceChart';
import DriversPanel from '../components/DriversPanel';
import NewsWidget from '../components/NewsWidget';
import NetworksTable from '../components/NetworksTable';
import AnalyticsPanel from '../components/AnalyticsPanel';
import ForecastPanel from '../components/ForecastPanel';
import AlertsPanel from '../components/AlertsPanel';
import RegionsPanel from '../components/RegionsPanel';

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-2.5">
      <FuelTickers />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <div className="lg:col-span-2">
          <PriceHero />
        </div>
        <DriversPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <div className="lg:col-span-2">
          <PriceChart />
        </div>
        <NewsWidget />
      </div>

      <NetworksTable />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <AnalyticsPanel />
        <ForecastPanel />
        <AlertsPanel />
      </div>

      <RegionsPanel />
    </div>
  );
}
