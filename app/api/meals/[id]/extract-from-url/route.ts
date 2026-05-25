import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { extractRecipe } from '@/lib/llm/extractRecipe';
import type { MealIngredientInsert } from '@/types/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_BYTES = 1_000_000; // 1 MB

/** Strip <script> and <style> blocks (including content) from HTML. */
function stripScriptAndStyle(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id: meal_id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.url !== 'string' || raw.url.trim() === '') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const mode = raw.mode === 'replace' ? 'replace' : 'append';

  // Verify meal exists
  const { data: meal, error: mealError } = await supabaseServerClient
    .from('meals')
    .select('id')
    .eq('id', meal_id)
    .single();

  if (mealError || !meal) {
    return NextResponse.json({ error: 'Meal not found' }, { status: 404 });
  }

  // Fetch the recipe URL server-side
  let html: string;
  try {
    const res = await fetch(raw.url.trim(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; DormDinners/1.0; +https://dormdinners.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // No signal/timeout in standard fetch; rely on Vercel function timeout
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: HTTP ${res.status}` },
        { status: 422 },
      );
    }

    // Read at most MAX_BYTES
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'Could not read response body' }, { status: 422 });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        totalBytes += result.value.byteLength;
        chunks.push(result.value);
        if (totalBytes >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }

    const decoder = new TextDecoder();
    html = decoder.decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.byteLength + chunk.byteLength);
        merged.set(acc, 0);
        merged.set(chunk, acc.byteLength);
        return merged;
      }, new Uint8Array(0)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to fetch URL: ${message}` },
      { status: 422 },
    );
  }

  // Strip script/style before sending to LLM
  const cleanedHtml = stripScriptAndStyle(html);

  // Run LLM extraction
  let ingredients: Awaited<ReturnType<typeof extractRecipe>>;
  try {
    ingredients = await extractRecipe(cleanedHtml);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Recipe extraction failed: ${message}. Please add ingredients manually.`,
      },
      { status: 422 },
    );
  }

  if (ingredients.length === 0) {
    return NextResponse.json(
      { error: 'No ingredients found on that page. Please add ingredients manually.' },
      { status: 422 },
    );
  }

  // Replace mode: soft-delete existing ingredients by deleting them
  if (mode === 'replace') {
    const { error: deleteError } = await supabaseServerClient
      .from('meal_ingredients')
      .delete()
      .eq('meal_id', meal_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  // Insert new ingredients
  const inserts: MealIngredientInsert[] = ingredients.map((ing) => ({
    meal_id,
    name: ing.name,
    quantity: [ing.quantity, ing.unit].filter(Boolean).join(' ') || null,
  }));

  const { data: inserted, error: insertError } = await supabaseServerClient
    .from('meal_ingredients')
    .insert(inserts)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ingredients: inserted });
}
