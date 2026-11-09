import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, LayoutGrid, List, Cake, FileDown } from 'lucide-react'
import {
  PageHeader, Card, SearchInput, Badge, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, TableWrap, THead,
  Confirm, ErrorNote, ProgressBar,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listProducts, createProduct, updateProduct, deleteProduct, listCategories, addCategory, deleteCategory,
} from '../repositories/catalog'
import { listRecipes, recipeCosting } from '../repositories/recipes'
import { profitability } from '../lib/calc'
import { getSettings } from '../repositories/settings'
import { formatMoney, formatPct } from '../lib/format'
import { exportCsv } from '../lib/exporters'

const schema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  category_id: z.coerce.number().optional().nullable(),
  description: z.string().optional(),
  selling_price: z.coerce.number().min(0, 'Price cannot be negative'),
  recipe_id: z.string().optional().nullable(),
  unit_of_sale: z.string().optional(),
  availability: z.string().optional(),
  lead_time_days: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
})
type Values = z.infer<typeof schema>

export function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [view, setView] = useState<'gallery' | 'list'>('gallery')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
    const e = params.get('edit')
    if (e) {
      setEditing(e)
      setOpen(true)
      params.delete('edit')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const categories = useLive(() => listCategories(), [])
  const recipes = useLive(() => listRecipes(), [])
  const products = useLive(
    () => listProducts({ search, categoryId: category === 'All' ? undefined : categories.find((c) => c.name === category)?.id }),
    [search, category]
  )

  const costing = useMemo(() => {
    const s = settings ?? getSettings()
    const out: Record<string, { cost: number; margin: number; hasRecipe: boolean; hasPrice: boolean; complete: boolean }> = {}
    for (const p of products) {
      const r = p.recipe_id ? recipes.find((x) => x.id === p.recipe_id) : null
      if (!r) {
        out[p.id] = { cost: 0, margin: 0, hasRecipe: false, hasPrice: p.selling_price > 0, complete: false }
        continue
      }
      const c = recipeCosting(r, s)
      const prof = profitability(p.selling_price, c.costPerUnit)
      out[p.id] = { cost: c.costPerUnit, margin: prof.marginPct, hasRecipe: true, hasPrice: prof.hasPrice, complete: prof.hasPrice }
    }
    return out
  }, [products, recipes, settings])

  const doExport = () => {
    exportCsv(
      'products.csv',
      ['Product', 'Category', 'Selling price', 'Estimated cost', 'Est. margin', 'Units sold', 'Revenue', 'Status'],
      products.map((p) => [
        p.name, p.category_name, p.selling_price,
        p.recipe_id ? costing[p.id].cost : 'no recipe',
        p.recipe_id && costing[p.id].hasPrice ? `${costing[p.id].margin}%` : 'n/a',
        p.units_sold, p.revenue, p.availability,
      ])
    )
    toast('success', 'Products exported')
  }

  return (
    <>
      <PageHeader
        title="Products & Menu"
        subtitle={`${products.length} product${products.length === 1 ? '' : 's'}`}
        actions={
          <>
            <div className="flex rounded-xl border border-line overflow-hidden bg-white">
              <button
                className={`px-3 h-10 grid place-items-center ${view === 'gallery' ? 'bg-pink-100 text-pink-700' : 'text-muted'}`}
                onClick={() => setView('gallery')}
                title="Gallery view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={`px-3 h-10 grid place-items-center border-l border-line ${view === 'list' ? 'bg-pink-100 text-pink-700' : 'text-muted'}`}
                onClick={() => setView('list')}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus size={15} /> New product
            </button>
          </>
        }
      />

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-2.5 items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search products…" className="w-full sm:w-64" />
          <SelectInput className="!w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>All</option>
            {categories.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </SelectInput>
        </div>
      </Card>

      {products.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            title={search ? 'No products match' : 'Your menu is empty'}
            description={
              search
                ? 'Try another search or clear the category filter.'
                : 'Add products, link them to recipes, and you will see estimated cost and margin right here.'
            }
            icon={<Cake size={26} />}
            action={
              !search && (
                <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
                  <Plus size={15} /> Add product
                </button>
              )
            }
          />
        </Card>
      ) : view === 'gallery' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => {
            const c = costing[p.id]
            return (
              <Card key={p.id} className="p-0 overflow-hidden flex flex-col">
                <div className="h-24 bg-gradient-to-br from-pink-100 to-pale grid place-items-center text-3xl border-b border-line">
                  <Cake size={30} className="text-pink-400" />
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[14.5px] truncate">{p.name}</p>
                      <p className="text-[11.5px] text-muted">{p.category_name}</p>
                    </div>
                    <Badge tone={p.availability === 'active' ? 'success' : 'neutral'}>{p.availability}</Badge>
                  </div>

                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p className="tnum text-[19px] font-semibold">{formatMoney(p.selling_price)}</p>
                      <p className="text-[11px] text-muted">per {p.unit_of_sale}</p>
                    </div>
                    <div className="text-right">
                      {p.recipe_id ? (
                        <>
                          <p className="tnum text-[13px] text-muted">cost {formatMoney(c.cost)}</p>
                          <p className={`tnum text-[13px] font-medium ${c.margin >= 20 ? 'text-ok' : c.margin >= 0 ? 'text-warn' : 'text-bad'}`}>
                            {c.hasPrice ? `${formatPct(c.margin)} margin` : 'no price'}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11.5px] text-warn">No recipe linked</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-[12px] text-muted">
                    <span className="tnum">{p.units_sold} sold</span>
                    <span className="tnum">{formatMoney(p.revenue)}</span>
                  </div>

                  <div className="mt-3 flex gap-1.5 no-print">
                    <button className="btn-secondary !h-8 !text-[12.5px] flex-1" onClick={() => { setEditing(p.id); setOpen(true) }}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button className="btn-ghost !h-8 !px-2" onClick={() => setToDelete(p.id)} title="Delete">
                      <Trash2 size={15} className="text-bad" />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="p-0">
          <TableWrap>
            <THead cols={['Product', 'Category', 'Price', 'Est. cost', 'Margin', 'Sold', 'Revenue', 'Status', '']} />
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const c = costing[p.id]
                return (
                  <tr key={p.id} className="hover:bg-pale">
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-muted">{p.category_name}</td>
                    <td className="td tnum">{formatMoney(p.selling_price)}</td>
                    <td className="td tnum">{p.recipe_id ? formatMoney(c.cost) : <span className="text-warn text-[12px]">no recipe</span>}</td>
                    <td className="td tnum">
                      {p.recipe_id && c.hasPrice ? (
                        <span className={c.margin >= 20 ? 'text-ok' : c.margin >= 0 ? 'text-warn' : 'text-bad'}>{formatPct(c.margin)}</span>
                      ) : (
                        <span className="text-muted text-[12px]">n/a</span>
                      )}
                    </td>
                    <td className="td tnum">{p.units_sold}</td>
                    <td className="td tnum">{formatMoney(p.revenue)}</td>
                    <td className="td"><Badge tone={p.availability === 'active' ? 'success' : 'neutral'}>{p.availability}</Badge></td>
                    <td className="td text-right whitespace-nowrap no-print">
                      <button className="btn-ghost !h-8 !px-2" onClick={() => { setEditing(p.id); setOpen(true) }}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" onClick={() => setToDelete(p.id)}>
                        <Trash2 size={15} className="text-bad" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <ProductModal open={open} productId={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); toast('success', editing ? 'Product updated' : 'Product added') }} />

      <Confirm
        open={!!toDelete}
        title="Delete this product?"
        message="Existing orders keep their own copy of the product name and price, so history is unaffected. Products used by recipes stay linked in the recipe only through the product's recipe field."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          try {
            if (toDelete) deleteProduct(toDelete)
            toast('success', 'Product deleted')
          } catch (e) {
            toast('error', 'Could not delete', e instanceof Error ? e.message : String(e))
          } finally {
            setToDelete(null)
          }
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  )
}

function ProductModal({ open, productId, onClose, onSaved }: { open: boolean; productId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast)
  const [error, setError] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const categories = useLive(() => listCategories(), [])
  const recipes = useLive(() => listRecipes(), [])
  const products = useLive(() => (open && productId ? listProducts().find((p) => p.id === productId) : undefined), [open, productId])

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category_id: null, description: '', selling_price: 0, recipe_id: null, unit_of_sale: 'each', availability: 'active', lead_time_days: 0, notes: '' },
  })

  useEffect(() => {
    if (!open) return
    setError('')
    setShowNewCat(false)
    reset({
      name: products?.name ?? '',
      category_id: products?.category_id ?? null,
      description: products?.description ?? '',
      selling_price: products?.selling_price ?? 0,
      recipe_id: products?.recipe_id ?? '',
      unit_of_sale: products?.unit_of_sale ?? 'each',
      availability: products?.availability ?? 'active',
      lead_time_days: products?.lead_time_days ?? 0,
      notes: products?.notes ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId])

  const recipeId = watch('recipe_id')
  const linked = recipes.find((r) => r.id === recipeId)
  const preview = useLive(() => {
    if (!linked) return null
    const c = recipeCosting(linked, getSettings())
    return { cost: c.costPerUnit, yield: `${linked.yield_qty} ${linked.yield_unit}` }
  }, [recipeId])

  const submit = handleSubmit(async (v) => {
    setError('')
    try {
      let catId = v.category_id ?? null
      let catName = categories.find((c) => c.id === catId)?.name ?? 'Other'
      if (showNewCat && newCategory.trim()) {
        catId = addCategory(newCategory.trim())
        catName = newCategory.trim()
        setNewCategory('')
      }
      const payload = {
        name: v.name,
        category_id: catId,
        category_name: catName,
        description: v.description ?? '',
        selling_price: Number(v.selling_price) || 0,
        recipe_id: v.recipe_id || null,
        unit_of_sale: v.unit_of_sale || 'each',
        availability: v.availability || 'active',
        lead_time_days: Number(v.lead_time_days) || 0,
        notes: v.notes ?? '',
      }
      if (productId) updateProduct(productId, payload)
      else createProduct(payload)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  const selectedCat = categories.find((c) => c.id === (watch('category_id') ?? null))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={productId ? 'Edit product' : 'New product'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{productId ? 'Save changes' : 'Add product'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Product name" required error={errors.name?.message} className="sm:col-span-2">
            <TextInput autoFocus {...register('name')} placeholder="e.g. Chocolate Fudge Cake" />
          </Field>
          <Field label="Category">
            <div className="flex gap-1.5">
              <SelectInput {...register('category_id')} disabled={showNewCat}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectInput>
              <button type="button" className="btn-secondary !px-2.5" title="New category" onClick={() => setShowNewCat((v) => !v)}>
                +
              </button>
            </div>
            {showNewCat && (
              <div className="flex gap-1.5 mt-1.5">
                <TextInput className="!h-9" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" />
                <button
                  type="button"
                  className="btn-primary !h-9 !text-[12.5px]"
                  onClick={() => {
                    if (!newCategory.trim()) return
                    const id = addCategory(newCategory.trim())
                    setValue('category_id', id)
                    setShowNewCat(false)
                    setNewCategory('')
                    toast('success', 'Category added')
                  }}
                >
                  Add
                </button>
              </div>
            )}
            {selectedCat?.is_system === 1 && <p className="hint">Built-in category — it stays available for everyone.</p>}
          </Field>
          <Field label="Selling price" required error={errors.selling_price?.message}>
            <TextInput type="number" min={0} step="0.01" className="tnum" {...register('selling_price')} />
          </Field>
          <Field label="Unit of sale">
            <SelectInput {...register('unit_of_sale')}>
              {['each', 'slice', 'dozen', 'box', 'kg', 'g', 'tray', 'portion'].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Linked recipe" hint="Enables estimated cost and margin.">
            <SelectInput {...register('recipe_id')}>
              <option value="">— No recipe —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Availability">
            <SelectInput {...register('availability')}>
              <option value="active">Active (on the menu)</option>
              <option value="inactive">Inactive (hidden)</option>
            </SelectInput>
          </Field>
          <Field label="Preparation lead time (days)" hint="How long customers should order ahead.">
            <TextInput type="number" min={0} {...register('lead_time_days')} />
          </Field>
        </div>

        {preview && (
          <div className="rounded-xl bg-pale border border-line p-3.5 text-[13px] flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-muted">Recipe yield <b className="text-ink ml-1">{preview.yield}</b></span>
            <span className="text-muted">Estimated cost each <b className="text-ink ml-1 tnum">{formatMoney(preview.cost)}</b></span>
            <span className="text-muted">
              Est. profit{' '}
              <b className={`ml-1 tnum ${Number(watch('selling_price')) - preview.cost >= 0 ? 'text-ok' : 'text-bad'}`}>
                {formatMoney(Number(watch('selling_price')) - preview.cost)}
              </b>
            </span>
          </div>
        )}

        <Field label="Description">
          <TextArea rows={2} {...register('description')} placeholder="Short description for menus and quotes" />
        </Field>
        <Field label="Notes">
          <TextArea rows={2} {...register('notes')} placeholder="Internal notes" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
