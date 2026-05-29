/**
 * Minimal ambient types for `@julianpoy/recipe-clipper`, which ships no
 * declarations. Covers only the subset we use (server-side, ML disabled).
 */
declare module '@julianpoy/recipe-clipper' {
  interface ClipRecipeOptions {
    /** Window to read the recipe from (e.g. a JSDOM `dom.window`). */
    window?: unknown;
    /** Disable the TensorFlow.js ML fallback. */
    mlDisable?: boolean;
    mlClassifyEndpoint?: string;
    mlModelEndpoint?: string;
    ignoreMLClassifyErrors?: boolean;
  }

  interface ClippedRecipe {
    imageURL: string;
    title: string;
    description: string;
    source: string;
    yield: string;
    activeTime: string;
    totalTime: string;
    /** Newline-delimited raw ingredient lines. */
    ingredients: string;
    /** Newline-delimited instruction steps. */
    instructions: string;
    notes: string;
    nutritionInfo: string;
  }

  export function clipRecipe(options?: ClipRecipeOptions): Promise<ClippedRecipe>;
}
