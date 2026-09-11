import { baseApi } from './baseApi';
import type { PageParams, Paginated } from './types';

/* ---------------------------- Backend contract ---------------------------- */

/**
 * `POST /api/v1/image-quality/results`. Analysis runs on the device; only
 * the scores and findings are stored so they appear in history. The image
 * is never uploaded.
 */
export interface SaveImageQualityPayload {
  overallScore: number;
  status: 'GOOD' | 'FAIR' | 'POOR';
  blurScore: number;
  brightnessScore: number;
  resolutionScore: number;
  faceScore?: number | null;
  faceCount: number;
  checks: {
    faceDetected: boolean;
    blur: boolean;
    lowLight: boolean;
    overexposed: boolean;
    multipleFaces: boolean;
    faceOutsideFrame: boolean;
    resolution: 'LOW' | 'OK' | 'GOOD';
  };
  warnings: string[];
  recommendation: string;
  engine: string;
  processingMs?: number;
  imageWidth?: number;
  imageHeight?: number;
  sourceUri?: string;
}

export interface ImageQualitySummary {
  id: string;
  score: number;
  status: 'GOOD' | 'FAIR' | 'POOR';
  blur: 'none' | 'slight' | 'heavy';
  exposure: 'under' | 'good' | 'over';
  issues: string[];
  engine: string;
  createdAt: string;
}

/* ------------------------------- Endpoints ------------------------------- */

export const imageQualityApi = baseApi.injectEndpoints({
  endpoints: build => ({
    saveImageQualityResult: build.mutation<ImageQualitySummary, SaveImageQualityPayload>({
      query: body => ({ url: '/image-quality/results', method: 'POST', body }),
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    listImageQualityResults: build.query<Paginated<ImageQualitySummary>, PageParams | void>({
      query: params => ({ url: '/image-quality/results', params: params ?? undefined }),
      providesTags: [{ type: 'History', id: 'LIST' }],
    }),
  }),
});

export const { useSaveImageQualityResultMutation, useListImageQualityResultsQuery } =
  imageQualityApi;
