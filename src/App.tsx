import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { initDatabase } from './db/database'
import { getSettings } from './repositories/settings'
import { setFormatSettings } from './lib/format'
import { useApp } from './store/app'
import { AppShell } from './layout/AppShell'
import { Toasts } from './components/Toasts'
import { Spinner } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardPage } from './pages/Dashboard'
import { OrdersPage } from './pages/Orders'
import { OrderDetailPage } from './pages/OrderDetail'
import { CustomersPage } from './pages/Customers'
import { CustomerDetailPage } from './pages/CustomerDetail'
import { ProductsPage } from './pages/Products'
import { RecipesPage } from './pages/Recipes'
import { RecipeDetailPage } from './pages/RecipeDetail'
import { InventoryPage } from './pages/Inventory'
import { ProductionPage } from './pages/Production'
import { WastePage } from './pages/Waste'
import { CalendarPage } from './pages/Calendar'
import { SuppliersPage } from './pages/Suppliers'
import { FinancesPage } from './pages/Finances'
import { ReportsPage } from './pages/Reports'
import { SettingsPage } from './pages/Settings'
import { OnboardingPage } from './pages/Onboarding'

export default function App() {
  const booted = useApp((s) => s.booted)
  const boot = useApp((s) => s.boot)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await initDatabase()
        const s = getSettings()
        setFormatSettings(s)
        if (alive) boot(s)
      } catch (e) {
        console.error(e)
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [boot])

  const settings = useApp((s) => s.settings)

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-lg p-6 text-center">
          <h1 className="font-display text-xl mb-2">Could not open your bakery</h1>
          <p className="text-sm text-muted">{error}</p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!booted) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-pink-400 text-white grid place-items-center font-display text-2xl mb-4">
            B
          </div>
          <p className="font-display text-lg">Ultimate Bakery Tracker</p>
          <p className="text-sm text-muted mt-1">Opening your local database…</p>
          <div className="mt-3">
            <Spinner label="" />
          </div>
        </div>
      </div>
    )
  }

  const needsOnboarding = !settings?.onboarding_complete

  return (
    <>
      <Routes>
        <Route path="/welcome" element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
        <Route
          path="*"
          element={
            needsOnboarding ? (
              <Navigate to="/welcome" replace />
            ) : (
              <ErrorBoundary>
                <Routes>
                  <Route element={<AppShell />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/recipes" element={<RecipesPage />} />
                  <Route path="/recipes/:id" element={<RecipeDetailPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/production" element={<ProductionPage />} />
                  <Route path="/waste" element={<WastePage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/suppliers" element={<SuppliersPage />} />
                  <Route path="/finances" element={<FinancesPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </ErrorBoundary>
            )
          }
        />
      </Routes>
      <Toasts />
    </>
  )
}
