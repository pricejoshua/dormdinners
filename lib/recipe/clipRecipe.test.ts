import { describe, it, expect } from 'vitest';
import { clipRecipe } from './clipRecipe';

const BASE_URL = 'https://example.com/recipe';

function recipePage(ingredients: string[], recipeYield?: string): string {
  const items = ingredients.map((i) => `<li class="ingredient">${i}</li>`).join('\n');
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Test Recipe',
    recipeIngredient: ingredients,
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Do the thing.' }],
  };
  if (recipeYield) ld.recipeYield = recipeYield;
  return `<!doctype html><html><head><title>Test Recipe</title>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body>
<h1>Test Recipe</h1>
<ul class="ingredients">${items}</ul>
</body></html>`;
}

describe('clipRecipe', () => {
  it('extracts and structures ingredients from a recipe page', async () => {
    const html = recipePage(['2 cups flour', '3 eggs', '1 tablespoon sugar']);

    const { ingredients } = await clipRecipe(html, BASE_URL);

    expect(ingredients).toContainEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(ingredients).toContainEqual({ name: 'eggs', quantity: '3', unit: '' });
    expect(ingredients).toContainEqual({ name: 'sugar', quantity: '1', unit: 'tablespoon' });
  });

  it('returns empty ingredients when the page has no recognizable recipe', async () => {
    const html = '<!doctype html><html><body><p>Just a blog post, no recipe.</p></body></html>';

    const { ingredients } = await clipRecipe(html, BASE_URL);

    expect(ingredients).toEqual([]);
  });

  it('returns empty ingredients (does not throw) on malformed HTML', async () => {
    const { ingredients } = await clipRecipe('<<<not really html', BASE_URL);

    expect(Array.isArray(ingredients)).toBe(true);
  });

  it('extracts ingredients from JSON-LD even with no visible ingredient markup', async () => {
    const html = `<!doctype html><html><head><title>LD Only</title>
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'LD Recipe',
      recipeIngredient: ['2 cups flour', '3 eggs'],
    })}</script></head>
<body><h1>LD Recipe</h1><p>Prose, no ingredient list.</p></body></html>`;

    const { ingredients } = await clipRecipe(html, BASE_URL);

    expect(ingredients).toContainEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(ingredients).toContainEqual({ name: 'eggs', quantity: '3', unit: '' });
  });

  it('skips blank ingredient lines', async () => {
    const html = recipePage(['2 cups flour', '', '   ', '1 cup milk']);

    const { ingredients } = await clipRecipe(html, BASE_URL);

    expect(ingredients.every((i) => i.name.trim().length > 0)).toBe(true);
    expect(ingredients).toContainEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(ingredients).toContainEqual({ name: 'milk', quantity: '1', unit: 'cup' });
  });

  it('parses serves from the recipe yield', async () => {
    const html = recipePage(['2 cups flour'], 'Serves 4-6');

    const { serves } = await clipRecipe(html, BASE_URL);

    expect(serves).toBe(4);
  });

  it('returns null serves when no yield is present', async () => {
    const html = recipePage(['2 cups flour']);

    const { serves } = await clipRecipe(html, BASE_URL);

    expect(serves).toBeNull();
  });
});
