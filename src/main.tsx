import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { DataProviderComponent } from './context/DataContext.tsx'
import { FuelProvider } from './context/FuelContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DataProviderComponent>
        <FuelProvider>
          <App />
        </FuelProvider>
      </DataProviderComponent>
    </HashRouter>
  </StrictMode>,
)
