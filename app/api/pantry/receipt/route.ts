import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getVisionModel } from '@/lib/llm/client';
import { supabaseServerClient } from '@/lib/supabase/server';
import type { PantryItemRow, PantryItemInsert, ReferencePriceRow } from '@/types/database';

interface ReceiptItem {
  name: string;
  quantity_amount: number | null;
  quantity_unit: string | null;
  price: number | null;
}

interface ReceiptResponse {
  error: string | null;
  store: string | null;
  items: ReceiptItem[];
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image is required' }, { status: 400 });
  }

  const updated_by = formData.get('updated_by');
  const updatedBy = typeof updated_by === 'string' ? updated_by : null;

  const imageBuffer = Buffer.from(await file.arrayBuffer());

  let llmText: string;
  try {
    const result = await generateText({
      model: getVisionModel(),
      maxTokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imageBuffer, mimeType: file.type as string },
            {
              type: 'text',
              text: `You are parsing a grocery receipt image.
If the image is not a grocery receipt, or is too blurry/unclear to read reliably, return:
{ "error": "brief reason", "store": null, "items": [] }

Otherwise return ONLY a JSON object (no preamble, no markdown fences):
{
  "error": null,
  "store": "store name from receipt header, or null if not found",
  "items": [
    { "name": "item name", "quantity_amount": 2, "quantity_unit": "kg", "price": 4.99 }
  ]
}
Rules:
- Only include items that appear on the receipt. Do not invent items.
- Expand abbreviated item names into plain English (e.g. "GV BLA BEANS" → "Black Beans", "ORNG JCE 64OZ" → "Orange Juice"). If the abbreviation is ambiguous, use your best guess but keep it conservative.
- quantity_amount and quantity_unit may be null if not shown on the receipt.
- price may be null if not clearly a per-item price.
- Combine duplicate line items using quantity and the "ea" or "pack" unit.
- Omit non-food entries (coupons, discounts, tax lines, subtotals).
- Normalize unit strings: use "kg", "g", "L", "mL", "ea", "pack", "lb", "oz".`,
            },
          ],
        },
      ],
    });
    llmText = result.text;
    console.log('[receipt] raw LLM response:', llmText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Receipt parsing failed', detail: msg }, { status: 502 });
  }

  let parsed: unknown;
  try {
    const cleaned = llmText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: 'Could not parse receipt response' }, { status: 502 });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).items)
  ) {
    return NextResponse.json({ error: 'Could not parse receipt response' }, { status: 502 });
  }

  const receipt = parsed as ReceiptResponse;

  if (typeof receipt.error === 'string' && receipt.error) {
    return NextResponse.json({ error: receipt.error }, { status: 422 });
  }

  const store = typeof receipt.store === 'string' ? receipt.store : null;
  const items: ReceiptItem[] = receipt.items.map((item: unknown) => {
    const obj = item as Record<string, unknown>;
    return {
      name: typeof obj.name === 'string' ? obj.name : String(obj.name ?? ''),
      quantity_amount: typeof obj.quantity_amount === 'number' ? obj.quantity_amount : null,
      quantity_unit: typeof obj.quantity_unit === 'string' ? obj.quantity_unit : null,
      price: typeof obj.price === 'number' ? obj.price : null,
    };
  });

  const pantryInserts: PantryItemInsert[] = items.map((item) => ({
    name: item.name,
    quantity_amount: item.quantity_amount,
    quantity_unit: item.quantity_unit,
    updated_by: updatedBy,
  }));

  const { data: pantryData, error: pantryError } = await supabaseServerClient
    .from('pantry_items')
    .insert(pantryInserts)
    .select();

  if (pantryError) {
    return NextResponse.json({ error: pantryError.message }, { status: 500 });
  }

  // Reference price saving disabled
  const referencePriceData: ReferencePriceRow[] = [];

  const pricedItems =
    store === null
      ? items
          .filter((item) => item.price !== null)
          .map((item) => ({ name: item.name, price: item.price as number }))
      : [];

  return NextResponse.json(
    {
      store,
      pantryItems: pantryData as PantryItemRow[],
      referencePrices: referencePriceData,
      pricedItems,
    },
    { status: 201 },
  );
}
