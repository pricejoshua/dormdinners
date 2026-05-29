import { describe, it, expect } from 'vitest';
import { clipRecipe } from './clipRecipe';

const BASE_URL = 'https://example.com/recipe';

function recipePage(ingredients: string[]): string {
  const items = ingredients.map((i) => `<li class="ingredient">${i}</li>`).join('\n');
  return `<!doctype html><html><head><title>Test Recipe</title>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Test Recipe',
    recipeIngredient: ingredients,
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Do the thing.' }],
  })}</script>
</head><body>
<h1>Test Recipe</h1>
<ul class="ingredients">${items}</ul>
</body></html>`;
}

describe('clipRecipe', () => {
  it('extracts and structures ingredients from a recipe page', async () => {
    const html = recipePage(['2 cups flour', '3 eggs', '1 tablespoon sugar']);

    const result = await clipRecipe(html, BASE_URL);

    expect(result).toContainEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(result).toContainEqual({ name: 'eggs', quantity: '3', unit: '' });
    expect(result).toContainEqual({ name: 'sugar', quantity: '1', unit: 'tablespoon' });
  });

  it('returns an empty array when the page has no recognizable recipe', async () => {
    const html = '<!doctype html><html><body><p>Just a blog post, no recipe.</p></body></html>';

    const result = await clipRecipe(html, BASE_URL);

    expect(result).toEqual([]);
  });

  it('returns an empty array (does not throw) on malformed HTML', async () => {
    const result = await clipRecipe('<<<not really html', BASE_URL);

    expect(Array.isArray(result)).toBe(true);
  });

  it('skips blank ingredient lines', async () => {
    const html = recipePage(['2 cups flour', '', '   ', '1 cup milk']);

    const result = await clipRecipe(html, BASE_URL);

    expect(result.every((i) => i.name.trim().length > 0)).toBe(true);
    expect(result).toContainEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(result).toContainEqual({ name: 'milk', quantity: '1', unit: 'cup' });
  });
});
