import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Copy, Archive, Trash2, BookOpen, Timer, Scale } from 'lucide-react'
import {
  PageHeader, Card, SearchInput, Badge, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, ErrorNote, Confirm,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listRecipes, createRecipe, updateRecipe, duplicateRecipe, archiveRecipe, deleteRecipe, getRecipeIngredients,
  recipeCategories, recipeCosting, type RecipeDraft,
} from '../repositories/recipes'
import { listIngredients } from '../repositories/inventory'
import { listProducts } from '../repositories/catalog'
import { getSettings } from '../repositories/settings'
import { formatMoney } from '../lib/format'
import { minutesToHm } from '../lib/dates'
import { UNITS } from '../lib/units'
import { profitability } from '../lib/calc'

export function RecipesPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [toArchive, setToArchive] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const recipes = useLive(() => listRecipes({ search, category: category === 'All' ? undefined : category }), [search, category])
  const cats = useLive(() => recipeCategories(), [])

  const costing = useLive(() => {
    const s = settings ?? getSettings()
    return Object.fromEntries(recipes.map((r) => [r.id, recipeCosting(r, s)]))
  }, [recipes.length])

  const menuRecipeIds = useLive(() => {
    const ids = new Set<string>()
    for (const p of listProducts()) if (p.recipe_id) ids.add(p.recipe_id)
    return ids
  }, [])

  return (
    <>
      <PageHeader
        title="Recipes"
        subtitle={`${recipes.length} recipe${recipes.length === 1 ? '' : 's'} in your library`}
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus size={15} /> New recipe
          </button>
        }
      />

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search recipes…" className="w-full sm:w-64" />
          <SelectInput className="!w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>All</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectInput>
        </div>
      </Card>

      {recipes.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            title={search ? 'No recipes match' : 'No recipes yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Recipes give you real costing, scaling and automatic ingredient consumption during production.'
            }
            icon={<BookOpen size={26} />}
            action={
              !search && (
                <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
                  <Plus size={15} /> Create recipe
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((r) => {
            const c = costing[r.id]
            const linked = menuRecipeIds.has(r.id)
            return (
              <Card key={r.id} className="p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/recipes/${r.id}`} className="font-display text-[16px] hover:text-pink-600 block truncate">
                      {r.name}
                    </Link>
                    <p className="text-[11.5px] text-muted">{r.category}</p>
                  </div>
                  {linked && <Badge tone="pink">on menu</Badge>}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-lg bg-pale py-2">
                    <p className="text-[10.5px] text-muted">Yield</p>
                    <p className="text-[13px] font-medium tnum">{r.yield_qty} {r.yield_unit}</p>
                  </div>
                  <div className="rounded-lg bg-pale py-2">
                    <p className="text-[10.5px] text-muted">Ingredients</p>
                    <p className="text-[13px] font-medium tnum">{getRecipeIngredients(r.id).length}</p>
                  </div>
                  <div className="rounded-lg bg-pale py-2">
                    <p className="text-[10.5px] text-muted">Time</p>
                    <p className="text-[13px] font-medium">{minutesToHm(r.prep_minutes + r.bake_minutes + r.cool_minutes)}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-line flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-muted">Total batch cost</p>
                    <p className="tnum text-[16px] font-semibold">{formatMoney(c.totalCost)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted">Per {r.yield_unit}</p>
                    <p className="tnum text-[16px] font-semibold text-pink-600">{formatMoney(c.costPerUnit)}</p>
                  </div>
                </div>

                {c.blocked.length > 0 && <p className="text-[11.5px] text-warn mt-2">⚠ {c.blocked.length} unit conversion issue(s)</p>}

                <div className="mt-3 flex gap-1.5 no-print">
                  <Link to={`/recipes/${r.id}`} className="btn-secondary !h-8 !text-[12.5px] flex-1">
                    Open
                  </Link>
                  <button className="btn-ghost !h-8 !px-2" title="Edit" onClick={() => { setEditing(r.id); setOpen(true) }}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn-ghost !h-8 !px-2"
                    title="Duplicate"
                    onClick={() => {
                      duplicateRecipe(r.id)
                      toast('success', 'Recipe duplicated')
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button className="btn-ghost !h-8 !px-2" title="Archive" onClick={() => setToArchive(r.id)}>
                    <Archive size={15} />
                  </button>
                  <button className="btn-ghost !h-8 !px-2" title="Delete" onClick={() => setToDelete(r.id)}>
                    <Trash2 size={15} className="text-bad" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <RecipeModal
        open={open}
        recipeId={editing}
        onClose={() => setOpen(false)}
        onSaved={(id) => {
          setOpen(false)
          toast('success', editing ? 'Recipe updated' : 'Recipe created')
          if (!editing && id) nav(`/recipes/${id}`)
        }}
      />

      <Confirm
        open={!!toDelete}
        title="Delete this recipe?"
        message="Products linked to it will lose the link (their price and sales history are unaffected). Production batches keep their own recipe snapshot, so past records stay intact."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) deleteRecipe(toDelete)
          toast('success', 'Recipe deleted')
          setToDelete(null)
        }}
        onCancel={() => setToDelete(null)}
      />
      <Confirm
        open={!!toArchive}
        title="Archive this recipe?"
        message="Archived recipes are hidden from the library but still available to past production records."
        confirmLabel="Archive"
        onConfirm={() => {
          if (toArchive) archiveRecipe(toArchive, true)
          toast('success', 'Recipe archived')
          setToArchive(null)
        }}
        onCancel={() => setToArchive(null)}
      />
    </>
  )
}

/* ================================ Editor ================================ */

interface Row {
  ingredient_id: string | null
  ingredient_name: string
  quantity: number
  unit: string
}

export function RecipeModal({
  open,
  recipeId,
  onClose,
  onSaved,
}: {
  open: boolean
  recipeId: string | null
  onClose: () => void
  onSaved: (id?: string) => void
}) {
  const toast = useApp((s) => s.toast)
  const [error, setError] = useState('')
  const ingredients = useLive(() => (open ? listIngredients() : []), [open])
  const existing = useLive(() => (open && recipeId ? listRecipes().find((r) => r.id === recipeId) : undefined), [open, recipeId])

  const [form, setForm] = useState({
    name: '',
    category: 'Cakes',
    description: '',
    yield_qty: 1,
    yield_unit: 'unit',
    prep_minutes: 0,
    bake_minutes: 0,
    cool_minutes: 0,
    instructions: '',
    notes: '',
    packaging_cost: 0,
    labor_minutes: 0,
    overhead_override: null as number | null,
  })
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    if (existing) {
      setForm({ ...existing, overhead_override: existing.overhead_override })
      setRows(
        getRecipeIngredients(existing.id).map((r) => ({
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient_name,
          quantity: r.quantity,
          unit: r.unit,
        }))
      )
    } else {
      setForm({
        name: '', category: 'Cakes', description: '', yield_qty: 1, yield_unit: 'unit',
        prep_minutes: 0, bake_minutes: 0, cool_minutes: 0, instructions: '', notes: '',
        packaging_cost: 0, labor_minutes: 0, overhead_override: null,
      })
      setRows([{ ingredient_id: null, ingredient_name: '', quantity: 100, unit: 'g' }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipeId])

  const cats = useLive(() => recipeCategories(), [])

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setError('')
    if (!form.name.trim()) {
      setError('Recipe name is required.')
      return
    }
    if (!(form.yield_qty > 0)) {
      setError('Batch yield must be greater than zero.')
      return
    }
    const cleaned = rows.filter((r) => r.ingredient_name.trim() || r.ingredient_id)
    if (!cleaned.length) {
      setError('Add at least one ingredient.')
      return
    }
    for (const r of cleaned) {
      if (!(r.quantity > 0)) {
        setError(`Quantity for ${r.ingredient_name || 'an ingredient'} must be greater than zero.`)
        return
      }
    }
    setSaving(true)
    try {
      const draft: RecipeDraft = { ...form, ingredients: cleaned }
      if (recipeId) {
        updateRecipe(recipeId, draft)
        onSaved(recipeId)
      } else {
        const created = createRecipe(draft)
        onSaved(created.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const pickIngredient = (idx: number, value: string) => {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== idx) return r
        if (!value) return { ...r, ingredient_id: null, ingredient_name: '' }
        const ing = ingredients.find((x) => x.id === value)
        return { ...r, ingredient_id: value, ingredient_name: ing?.name ?? r.ingredient_name, unit: ing?.purchase_unit ?? r.unit }
      })
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={recipeId ? 'Edit recipe' : 'New recipe'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : recipeId ? 'Save changes' : 'Create recipe'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Recipe name" required className="sm:col-span-2">
            <TextInput autoFocus value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. Vanilla Celebration Cake" />
          </Field>
          <Field label="Category">
            <TextInput list="recipe-cats" value={form.category} onChange={(e) => setF('category', e.target.value)} />
            <datalist id="recipe-cats">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Description">
            <TextInput value={form.description} onChange={(e) => setF('description', e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Batch yield" required hint="How much this recipe makes.">
            <div className="flex gap-1.5">
              <TextInput type="number" min={0.01} step="any" className="tnum" value={form.yield_qty} onChange={(e) => setF('yield_qty', Number(e.target.value))} />
              <TextInput value={form.yield_unit} onChange={(e) => setF('yield_unit', e.target.value)} placeholder="unit" />
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Prep (min)">
              <TextInput type="number" min={0} className="tnum" value={form.prep_minutes} onChange={(e) => setF('prep_minutes', Number(e.target.value))} />
            </Field>
            <Field label="Bake (min)">
              <TextInput type="number" min={0} className="tnum" value={form.bake_minutes} onChange={(e) => setF('bake_minutes', Number(e.target.value))} />
            </Field>
            <Field label="Cool (min)">
              <TextInput type="number" min={0} className="tnum" value={form.cool_minutes} onChange={(e) => setF('cool_minutes', Number(e.target.value))} />
            </Field>
          </div>
        </div>

        {/* ingredients */}
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-warm border-b border-line">
            <p className="text-[12.5px] font-semibold">Ingredients</p>
            <button
              className="btn-secondary !h-8 !px-2.5 !text-[12.5px]"
              onClick={() => setRows((rs) => [...rs, { ingredient_id: null, ingredient_name: '', quantity: 0, unit: 'g' }])}
            >
              <Plus size={13} /> Add ingredient
            </button>
          </div>
          <div className="divide-y divide-line">
            {rows.map((r, i) => {
              const ing = r.ingredient_id ? ingredients.find((x) => x.id === r.ingredient_id) : undefined
              const stockNeeded = ing ? (r.unit === ing.purchase_unit ? r.quantity : null) : null
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-3">
                  <div className="col-span-12 sm:col-span-5">
                    <SelectInput className="!h-9" value={r.ingredient_id ?? '__custom'} onChange={(e) => pickIngredient(i, e.target.value === '__custom' ? '' : e.target.value)}>
                      <option value="">— type a name —</option>
                      {ingredients.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </SelectInput>
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    {!r.ingredient_id ? (
                      <TextInput className="!h-9" value={r.ingredient_name} placeholder="Ingredient name" onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ingredient_name: e.target.value } : x)))} />
                    ) : (
                      <p className="text-[12.5px] text-muted h-9 flex items-center px-1">
                        {r.ingredient_name}
                        {stockNeeded !== null && ing && (
                          <span className="ml-2 text-[11px]">
                            · in stock {ing.current_stock} {ing.purchase_unit}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="col-span-5 sm:col-span-1">
                    <TextInput className="!h-9 tnum" type="number" min={0} step="any" value={r.quantity} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
                  </div>
                  <div className="col-span-5 sm:col-span-1">
                    <TextInput className="!h-9" value={r.unit} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <button className="btn-ghost !h-8 !px-2" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} title="Remove">
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Packaging cost (per batch)">
            <TextInput type="number" min={0} step="0.01" className="tnum" value={form.packaging_cost} onChange={(e) => setF('packaging_cost', Number(e.target.value))} />
          </Field>
          <Field label="Labour minutes (per batch)" hint="Costed at your labour rate in Settings.">
            <TextInput type="number" min={0} className="tnum" value={form.labor_minutes} onChange={(e) => setF('labor_minutes', Number(e.target.value))} />
          </Field>
          <Field label="Overhead override" hint="Blank = use your default overhead setting.">
            <TextInput type="number" min={0} step="0.01" className="tnum" value={form.overhead_override ?? ''} onChange={(e) => setF('overhead_override', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Preparation instructions">
          <TextArea rows={4} value={form.instructions} onChange={(e) => setF('instructions', e.target.value)} placeholder="Step by step…" />
        </Field>
        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => setF('notes', e.target.value)} placeholder="Tips, substitutions, allergens…" />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
