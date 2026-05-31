// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export interface FalAiSpriteRequest {
  prompt: string;
  negativePrompt?: string;
  imageSize?: 'square_hd' | 'square' | 'portrait_4_3' | 'landscape_4_3';
  numInferenceSteps?: number;
  seed?: number;
}

export interface FalAiSpriteResult {
  imageUrl: string;
  width: number;
  height: number;
  seed: number;
  inferenceTimeMs?: number;
}

export class FalAiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'FalAiError';
  }
}

export type FalAiFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface FalAiConfig {
  apiKey?: string;
  model?: string;
  fetchFn?: FalAiFetch;
}

const DEFAULT_MODEL = 'fal-ai/flux/schnell';
const FAL_BASE = 'https://fal.run';

export async function generateSprite(
  request: FalAiSpriteRequest,
  config: FalAiConfig,
): Promise<FalAiSpriteResult> {
  const apiKey = config.apiKey?.trim();
  const model = config.model?.trim() || DEFAULT_MODEL;

  if (!apiKey) {
    // Dry-run: return a placeholder so the UI can show something in dev
    return {
      imageUrl: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='%23333'/><text x='50%25' y='50%25' fill='%23aaa' text-anchor='middle' dominant-baseline='middle' font-size='14'>Sprite placeholder</text></svg>`,
      width: 256,
      height: 256,
      seed: 0,
    };
  }

  const fetchFn = config.fetchFn ?? (fetch as unknown as FalAiFetch);
  const response = await fetchFn(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: request.prompt,
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      image_size: request.imageSize ?? 'square',
      num_inference_steps: request.numInferenceSteps ?? 4,
      ...(request.seed != null ? { seed: request.seed } : {}),
    }),
  });

  if (!response.ok) {
    const text = await (response as Response).text?.().catch(() => '') ?? '';
    throw new FalAiError('fal_api_error', response.status, `Fal.ai error: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width: number; height: number }>;
    seed?: number;
    timings?: { inference?: number };
  };

  const image = data.images?.[0];
  if (!image?.url) {
    throw new FalAiError('fal_no_image', 502, 'Fal.ai did not return an image');
  }

  return {
    imageUrl: image.url,
    width: image.width ?? 256,
    height: image.height ?? 256,
    seed: data.seed ?? 0,
    inferenceTimeMs: data.timings?.inference ? Math.round(data.timings.inference * 1000) : undefined,
  };
}
