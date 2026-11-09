import { query, queryOne, run, transaction, nowIso, logAudit } from '../db/database'
import { uid } from '../lib/id'
import { round2, roundQty } from '../lib/money'
import { notifyDataChanged } from '../store/app'
import type { Ingredient, Recipe, RecipeIngredient, Settings } from '../types'
import { costRecipe, type RecipeCosting } from '../lib/calc'

export function listRecipes(opts: { search?: string; category?: string; includeArchived?: boolean } = {}): Recipe[] {
  const where: string[] = []
  const params: unknown[] = []
  if (!opts.includeArchived) where.push('archived_at IS NULL')
  if (opts.search?.trim()) {
    where.push('(name LIKE ? OR category LIKE ? OR description LIKE ?)')
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q)
  }
  if (opts.category) {
    where.push('category = ?')
    params.push(opts.category)
  }
  return query(
    `SELECT * FROM recipes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE ASC`,
    params
  )
}

export function getRecipe(id: string): Recipe | undefined {
  return queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [id])
}

export function getRecipeIngredients(recipeId: string): RecipeIngredient[] {
  return query<RecipeIngredient>('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order, id', [recipeId])
}

export function recipeCategories(): string[] {
  return query<{ category: string }>('SELECT DISTINCT category FROM recipes ORDER BY category').map((r) => r.category)
}

export interface RecipeDraft {
  name: string
  category: string
  description: string
  yield_qty: number
  yield_unit: string
  prep_minutes: number
  bake_minutes: number
  cool_minutes: number
  instructions: string
  notes: string
  packaging_cost: number
  labor_minutes: number
  overhead_override: number | null
  ingredients: { ingredient_id: string | null; ingredient_name: string; quantity: number; unit: string }[]
}

function validateDraft(d: RecipeDraft) {
  if (!d.name?.trim()) throw new Error('Recipe name is required.')
  if (!Number.isFinite(d.yield_qty) || d.yield_qty <= 0) throw new Error('Batch yield must be greater than zero.')
  for (const li of d.ingredients) {
    if (!li.ingredient_name?.trim()) throw new Error('Every ingredient row needs a name.')
    if (!Number.isFinite(li.quantity) || li.quantity < 0) throw new Error(`Invalid quantity for ${li.ingredient_name}.`)
    if (li.quantity === 0) throw new Error(`Quantity for ${li.ingredient_name} cannot be zero.`)
  }
}

function writeIngredients(recipeId: string, ingredients: RecipeDraft['ingredients']) {
  run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId])
  ingredients.forEach((li, idx) => {
    const ing = li.ingredient_id ? queryOne<Ingredient>('SELECT * FROM ingredients WHERE id = ?', [li.ingredient_id]) : undefined
    run(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, ingredient_name, quantity, unit, unit_cost, sort_order)
       VALUES (?,?,?,?,?,?,?)`,
      [recipeId, li.ingredient_id, li.ingredient_name.trim(), li.quantity, li.unit, ing ? ing.avg_cost : 0, idx]
    )
  })
}

export function createRecipe(d: RecipeDraft): Recipe {
  validateDraft(d)
  const id = uid('rec_')
  transaction(() => {
    run(
      `INSERT INTO recipes (id,name,category,description,yield_qty,yield_unit,prep_minutes,bake_minutes,cool_minutes,
        instructions,notes,image_path,packaging_cost,labor_minutes,overhead_override,archived_at,created_at,is_sample)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,0)`,
      [
        id,
        d.name.trim(),
        d.category || 'Other',
        d.description ?? '',
        d.yield_qty,
        d.yield_unit || 'unit',
        Number(d.prep_minutes) || 0,
        Number(d.bake_minutes) || 0,
        Number(d.cool_minutes) || 0,
        d.instructions ?? '',
        d.notes ?? '',
        round2(d.packaging_cost),
        Number(d.labor_minutes) || 0,
        d.overhead_override,
        nowIso(),
      ]
    )
    writeIngredients(id, d.ingredients)
    logAudit('recipe', id, 'create', d.name)
  })
  notifyDataChanged()
  return getRecipe(id)!
}

export function updateRecipe(id: string, d: RecipeDraft) {
  validateDraft(d)
  transaction(() => {
    run(
      `UPDATE recipes SET name=?, category=?, description=?, yield_qty=?, yield_unit=?, prep_minutes=?, bake_minutes=?,
        cool_minutes=?, instructions=?, notes=?, packaging_cost=?, labor_minutes=?, overhead_override=? WHERE id=?`,
      [
        d.name.trim(),
        d.category || 'Other',
        d.description ?? '',
        d.yield_qty,
        d.yield_unit || 'unit',
        Number(d.prep_minutes) || 0,
        Number(d.bake_minutes) || 0,
        Number(d.cool_minutes) || 0,
        d.instructions ?? '',
        d.notes ?? '',
        round2(d.packaging_cost),
        Number(d.labor_minutes) || 0,
        d.overhead_override,
        id,
      ]
    )
    writeIngredients(id, d.ingredients)
    logAudit('recipe', id, 'update', d.name)
  })
  notifyDataChanged()
}

export function duplicateRecipe(id: string): Recipe | undefined {
  const src = getRecipe(id)
  if (!src) return undefined
  const newId = uid('rec_')
  transaction(() => {
    run(
      `INSERT INTO recipes (id,name,category,description,yield_qty,yield_unit,prep_minutes,bake_minutes,cool_minutes,
        instructions,notes,image_path,packaging_cost,labor_minutes,overhead_override,archived_at,created_at,is_sample)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,0)`,
      [
        newId,
        `${src.name} (copy)`,
        src.category,
        src.description,
        src.yield_qty,
        src.yield_unit,
        src.prep_minutes,
        src.bake_minutes,
        src.cool_minutes,
        src.instructions,
        src.notes,
        src.packaging_cost,
        src.labor_minutes,
        src.overhead_override,
        nowIso(),
      ]
    )
    const items = getRecipeIngredients(id)
    items.forEach((li, idx) => {
      run(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, ingredient_name, quantity, unit, unit_cost, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [newId, li.ingredient_id, li.ingredient_name, li.quantity, li.unit, li.unit_cost, idx]
      )
    })
    logAudit('recipe', id, 'duplicate', newId)
  })
  notifyDataChanged()
  return getRecipe(newId)
}

export function archiveRecipe(id: string, archived: boolean) {
  run('UPDATE recipes SET archived_at = ? WHERE id = ?', [archived ? nowIso() : null, id])
  logAudit('recipe', id, archived ? 'archive' : 'restore')
  notifyDataChanged()
}

export function deleteRecipe(id: string) {
  transaction(() => {
    run('UPDATE products SET recipe_id = NULL WHERE recipe_id = ?', [id])
    run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id])
    run('DELETE FROM recipes WHERE id = ?', [id])
  })
  logAudit('recipe', id, 'delete')
  notifyDataChanged()
}

/** Unit cost map keyed by ingredient id — shared by costing everywhere. */
export function unitCostMap(): Record<string, { cost: number; purchase_unit: string }> {
  const rows = query<Ingredient>('SELECT id, avg_cost, purchase_unit FROM ingredients')
  const out: Record<string, { cost: number; purchase_unit: string }> = {}
  for (const r of rows) out[r.id] = { cost: Number(r.avg_cost) || 0, purchase_unit: r.purchase_unit }
  return out
}

export function recipeCosting(recipe: Recipe, settings: Settings): RecipeCosting {
  return costRecipe(recipe, getRecipeIngredients(recipe.id), settings, unitCostMap())
}

/** Expected ingredient consumption for a batch of `actualQty` finished units. */
export function expectedConsumption(
  recipe: Recipe,
  qty: number,
  settings: Settings
): { ingredient_id: string | null; ingredient_name: string; unit: string; quantity: number; unit_cost: number; total_cost: number }[] {
  const lines = getRecipeIngredients(recipe.id)
  const scale = recipe.yield_qty > 0 ? qty / recipe.yield_qty : 0
  const costMap = unitCostMap()
  return lines.map((li) => {
    const info = li.ingredient_id ? costMap[li.ingredient_id] : undefined
    const unitCost = info?.cost ?? li.unit_cost ?? 0
    const quantity = roundQty(li.quantity * scale)
    return {
      ingredient_id: li.ingredient_id,
      ingredient_name: li.ingredient_name,
      unit: li.unit,
      quantity,
      unit_cost: round2(unitCost),
      total_cost: round2(quantity * unitCost),
    }
  })
}
