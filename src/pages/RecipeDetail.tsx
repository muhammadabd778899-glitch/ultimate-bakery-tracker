import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Scale, Timer, AlertTriangle, Printer, FileDown } from 'lucide-react'
import { PageHeader, Card, Grid, Badge, EmptyState, Field, TextInput, TableWrap, THead } from '../components/ui'
import { RecipeModal } from './Recipes'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { getRecipe, getRecipeIngredients, recipeCosting } from '../repositories/recipes'
import { listProducts } from '../repositories/catalog'
import { getSettings } from '../repositories/settings'
import { formatMoney, formatPct } from '../lib/format'
import { minutesToHm, formatDisplayDate } from '../lib/dates'
import { getDateFormat } from '../lib/format'
import { scaleQuantity, profitability } from '../lib/calc'
import { round } from '../lib/money'
import { exportPdf } from '../lib/exporters'

export function RecipeDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)
  const [edit, setEdit] = useState(false)
  const [scaleTo, setScaleTo] = useState<number>(0)

  const data = useLive(() => {
    const recipe = getRecipe(id)
    if (!recipe) return null
    const lines = getRecipeIngredients(id)
    const costing = recipeCosting(recipe, settings ?? getSettings())
    const products = listProducts().filter((p) => p.recipe_id === id)
    return { recipe, lines, costing, products }
  }, [id, settings])

  if (!data) {
    return (
      <Card className="p-8">
        <EmptyState title="Recipe not found" action={<button className="btn-primary" onClick={() => nav('/recipes')}>Back to recipes</button>} />
      </Card>
    )
  }

  const { recipe, lines, costing, products } = data
  const target = scaleTo > 0 ? scaleTo : recipe.yield_qty
  const factor = recipe.yield_qty > 0 ? target / recipe.yield_qty : 0
  const profit = profitability(products[0]?.selling_price ?? 0, costing.costPerUnit)

  const doPdf = () => {
    exportPdf({
      title: recipe.name,
      subtitle: `Yield ${recipe.yield_qty} ${recipe.yield_unit} · total cost ${formatMoney(costing.totalCost)} · per unit ${formatMoney(costing.costPerUnit)}`,
      table: {
        head: ['Ingredient', 'Quantity', 'Unit', 'Cost'],
        body: costing.lines.map((l) => [l.name, String(round(l.quantity * factor, 3)), l.unit, formatMoney(l.cost * factor)]),
        foot: [['Total', '', '', formatMoney(costing.totalCost * factor)]],
      },
      filename: `${recipe.name}.pdf`,
    })
  }

  return (
    <>
      <div className="no-print">
        <button className="btn-ghost !px-0 mb-3" onClick={() => nav('/recipes')}>
          <ArrowLeft size={15} /> All recipes
        </button>
        <PageHeader
          title={recipe.name}
          subtitle={`${recipe.category} · created ${formatDisplayDate(recipe.created_at.slice(0, 10), getDateFormat())}`}
          actions={
            <>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={15} /> Print
              </button>
              <button className="btn-secondary" onClick={doPdf}>
                <FileDown size={15} /> PDF
              </button>
              <button className="btn-primary" onClick={() => setEdit(true)}>
                <Pencil size={15} /> Edit recipe
              </button>
            </>
          }
        />
      </div>

      <Grid cols={4} className="mb-5">
        <Kpi label="Total batch cost" value={formatMoney(costing.totalCost)} />
        <Kpi label={`Cost per ${recipe.yield_unit}`} value={formatMoney(costing.costPerUnit)} accent />
        <Kpi label="Yield" value={`${recipe.yield_qty} ${recipe.yield_unit}`} />
        <Kpi label="Total time" value={minutesToHm(recipe.prep_minutes + recipe.bake_minutes + recipe.cool_minutes)} />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card
            title="Ingredients & cost"
            action={
              <div className="flex items-center gap-2">
                <Scale size={14} className="text-pink-500" />
                <span className="text-[11.5px] text-muted">Scale to</span>
                <TextInput
                  className="!h-8 !w-24 !text-[12.5px] tnum"
                  type="number"
                  min={0}
                  step="any"
                  value={scaleTo || ''}
                  placeholder={String(recipe.yield_qty)}
                  onChange={(e) => setScaleTo(Number(e.target.value))}
                />
                <button className="btn-ghost !h-8 !text-[12px]" onClick={() => setScaleTo(0)}>
                  Reset
                </button>
              </div>
            }
            className="p-0"
          >
            <div className="px-5 py-2.5 bg-pale border-b border-line text-[12.5px] flex flex-wrap gap-x-5">
              <span className="text-muted">
                Original yield <b className="text-ink tnum ml-1">{recipe.yield_qty} {recipe.yield_unit}</b>
              </span>
              <span className="text-muted">
                Adjusted yield <b className="text-ink tnum ml-1">{round(target, 3)} {recipe.yield_unit}</b>
              </span>
              <span className="text-muted">
                Scale <b className="text-ink tnum ml-1">{round(factor, 3)}×</b>
              </span>
            </div>

            {costing.lines.length === 0 ? (
              <EmptyState title="No ingredients" description="Add ingredients to see the cost of this recipe." />
            ) : (
              <TableWrap>
                <THead cols={['Ingredient', 'Quantity', 'Purchase unit', 'Cost per unit', 'Line cost']} />
                <tbody className="divide-y divide-line">
                  {costing.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-pale">
                      <td className="td font-medium">
                        {l.name}
                        {!l.convertible && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-warn">
                            <AlertTriangle size={11} /> conversion needed
                          </span>
                        )}
                      </td>
                      <td className="td tnum">
                        {round(l.quantity * factor, 3)} {l.unit}
                      </td>
                      <td className="td text-muted">
                        {l.convertible ? (
                          <span className="tnum">
                            {round(l.cost_quantity * factor, 3)} {l.purchase_unit}
                          </span>
                        ) : (
                          <span className="text-warn text-[12px]">—</span>
                        )}
                      </td>
                      <td className="td tnum">{formatMoney(l.unit_cost)}</td>
                      <td className="td tnum font-medium">
                        {l.convertible ? formatMoney(l.cost * factor) : <span className="text-warn text-[12px]">not costed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}

            {costing.blocked.length > 0 && (
              <div className="px-5 py-3 bg-[#FCF1E1] border-t border-line text-[12.5px] text-[#8A5F24] space-y-1">
                <p className="font-medium">Some ingredients could not be converted to their purchase unit:</p>
                {costing.blocked.map((b, i) => (
                  <p key={i}>• {b}</p>
                ))}
                <p>Add the missing conversion in Settings → Unit conversions.</p>
              </div>
            )}
          </Card>

          {recipe.description && (
            <Card title="About this recipe" className="p-5">
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{recipe.description}</p>
            </Card>
          )}

          {recipe.instructions && (
            <Card title="Preparation" className="p-5">
              <ol className="space-y-3">
                {recipe.instructions
                  .split(/\n+/)
                  .filter((s) => s.trim())
                  .map((step, i) => (
                    <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed">
                      <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-700 grid place-items-center text-[11.5px] font-semibold shrink-0">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
              </ol>
            </Card>
          )}

          {recipe.notes && (
            <Card title="Notes" className="p-5">
              <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed">{recipe.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Cost breakdown" className="p-5">
            <dl className="space-y-2.5 text-[13.5px]">
              <Row label="Ingredients" value={formatMoney(costing.ingredientCost * factor)} />
              <Row label="Packaging" value={formatMoney(costing.packagingCost * factor)} />
              <Row label="Labour" value={formatMoney(costing.laborCost * factor)} hint={minutesToHm(recipe.labor_minutes)} />
              <Row label="Overhead" value={formatMoney(costing.overheadCost * factor)} />
              <div className="flex justify-between pt-2.5 border-t border-line font-semibold">
                <dt>Total</dt>
                <dd className="tnum">{formatMoney(costing.totalCost * factor)}</dd>
              </div>
              <div className="flex justify-between text-pink-700 font-medium">
                <dt>Per {recipe.yield_unit}</dt>
                <dd className="tnum">{formatMoney(costing.costPerUnit)}</dd>
              </div>
            </dl>
            <p className="text-[11.5px] text-muted mt-3 leading-relaxed">
              Estimated cost based on your current ingredient prices. Actual production cost can differ — batches record what
              was really used.
            </p>
          </Card>

          <Card title="Linked products" className="p-5">
            {products.length === 0 ? (
              <div>
                <p className="text-[13px] text-muted">No product uses this recipe yet, so margin cannot be shown.</p>
                <Link to="/products?new=1" className="btn-secondary !h-8 !text-[12.5px] mt-3 inline-flex">
                  Create a product
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((p) => {
                  const prof = profitability(p.selling_price, costing.costPerUnit)
                  return (
                    <div key={p.id} className="rounded-xl border border-line p-3">
                      <p className="text-[13.5px] font-medium">{p.name}</p>
                      <div className="flex justify-between text-[12.5px] mt-1.5">
                        <span className="text-muted">Price <b className="text-ink tnum ml-1">{formatMoney(p.selling_price)}</b></span>
                        <span className="text-muted">Profit <b className="tnum ml-1 text-ok">{formatMoney(prof.profit)}</b></span>
                      </div>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-muted">Cost <b className="text-ink tnum ml-1">{formatMoney(costing.costPerUnit)}</b></span>
                        <span className="text-muted">Margin <b className="tnum ml-1">{formatPct(prof.marginPct)}</b></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Timing" className="p-5">
            <div className="space-y-2.5 text-[13.5px]">
              <div className="flex justify-between"><span className="text-muted">Preparation</span><span className="tnum">{minutesToHm(recipe.prep_minutes)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Baking</span><span className="tnum">{minutesToHm(recipe.bake_minutes)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Cooling</span><span className="tnum">{minutesToHm(recipe.cool_minutes)}</span></div>
              <div className="flex justify-between pt-2 border-t border-line font-medium"><span>Total</span><span className="tnum">{minutesToHm(recipe.prep_minutes + recipe.bake_minutes + recipe.cool_minutes)}</span></div>
            </div>
            <p className="text-[12px] text-muted mt-3 inline-flex items-center gap-1.5">
              <Timer size={13} className="text-pink-500" /> Plan production a day ahead to be safe.
            </p>
          </Card>
        </div>
      </div>

      <RecipeModal open={edit} recipeId={recipe.id} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast('success', 'Recipe updated') }} />
    </>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className={`mt-1.5 text-[21px] font-semibold tnum ${accent ? 'text-pink-600' : 'text-ink'}`}>{value}</p>
    </Card>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">
        {label}
        {hint && <span className="text-[11.5px] ml-1.5">{hint}</span>}
      </dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  )
}
