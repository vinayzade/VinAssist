/**
 * Image-quality report screen with React Native Testing Library: the score
 * and verdict, the per-check chips and bars, warnings, saving, and the
 * hand-off to the assistant.
 */

import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ImageQualityResultScreen } from '@/features/imageQuality';
import { scoreImageQuality, type ImageMetrics, type QualitySubject } from '@/services/imageQuality';
import { installFetchMock, type FetchMock } from '../../test-utils/fetchMock';
import { fakeNavigation, fakeRoute, renderWithProviders } from '../../test-utils/render';

function metrics(overrides: Partial<ImageMetrics> = {}): ImageMetrics {
  return {
    width: 3000,
    height: 4000,
    laplacianVariance: 900,
    meanLuma: 128,
    lumaStdDev: 55,
    darkPixelRatio: 0.05,
    brightPixelRatio: 0.01,
    faces: [
      {
        frame: { x: 1000, y: 1200, width: 1000, height: 1300 },
        areaRatio: (1000 * 1300) / (3000 * 4000),
        outsideFrame: false,
        yaw: 3,
        roll: 1,
        eyesOpen: true,
      },
    ],
    faceDetectionRan: true,
    durationMs: 210,
    ...overrides,
  };
}

let api: FetchMock;
beforeEach(() => {
  api = installFetchMock();
});

async function renderReport(m: ImageMetrics = metrics(), subject: QualitySubject = 'portrait') {
  const navigation = fakeNavigation();
  const result = scoreImageQuality(m, subject);
  const view = await renderWithProviders(
    <ImageQualityResultScreen
      navigation={navigation as never}
      route={fakeRoute('ImageQualityResult', { imageUri: 'file:///photo.jpg', result })}
    />,
  );
  return { navigation, result, ...view };
}

describe('Image quality result UI', () => {
  it('shows a good verdict with a high score and all checks passing', async () => {
    const { result } = await renderReport();
    expect(screen.getByTestId('quality-status')).toHaveTextContent(/Good quality/);
    expect(Number(screen.getByTestId('quality-score').props.children)).toBe(result.overallScore);
    expect(result.overallScore).toBeGreaterThanOrEqual(75);
    expect(screen.getByTestId('chip-blur')).toHaveTextContent(/Sharp/);
    expect(screen.getByTestId('chip-face')).toBeTruthy();
    expect(screen.getByTestId('quality-recommendation')).toHaveTextContent(/./);
  });

  it('flags a blurry, dark photo with warnings and a poor verdict', async () => {
    const { result } = await renderReport(metrics({ laplacianVariance: 20, meanLuma: 30, darkPixelRatio: 0.7 }));
    expect(result.status).toBe('POOR');
    expect(screen.getByTestId('quality-status')).toHaveTextContent(/Poor quality/);
    expect(screen.getByTestId('chip-blur')).toHaveTextContent(/Blurry/);
    expect(screen.getByTestId('quality-warnings')).toBeTruthy();
    for (const warning of result.warnings) {
      expect(screen.getByText(warning.message)).toBeTruthy();
    }
  });

  it('for a general photo, the face check is informational and a missing face is not penalised', async () => {
    const { result } = await renderReport(metrics({ faces: [] }), 'general');
    expect(result.faceScore).toBeNull();
    expect(screen.getByTestId('bar-face')).toHaveTextContent(/n\/a/);
    expect(screen.getByTestId('bar-face')).toHaveTextContent(/not required for this photo/);
    expect(screen.getByTestId('quality-status')).toHaveTextContent(/Good quality/);
  });

  it('saves the report and shows the saved state; a failed save explains itself', async () => {
    api.on('POST', '/api/v1/image-quality/results', () =>
      api.json({ id: 'q1', score: 84, status: 'GOOD', blur: 'none', exposure: 'good', issues: [], engine: 'on-device', createdAt: 'x' }, 201),
    );
    await renderReport();
    await fireEvent.press(screen.getByTestId('quality-save'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const [call] = api.calls('POST', '/api/v1/image-quality/results');
    expect(call.body).toMatchObject({ status: 'GOOD', faceCount: 1, engine: 'on-device', imageWidth: 3000, imageHeight: 4000 });
    expect(call.headers.get('Authorization')).toBe('Bearer access-1');

    api.on('POST', '/api/v1/image-quality/results', () => api.json({ detail: 'Storage is full.', code: 'STORAGE' }, 507));
    const second = await renderReport();
    await fireEvent.press(second.getByTestId('quality-save'));
    expect(await second.findByTestId('quality-save-error')).toHaveTextContent(/Could not save to your history: Storage is full\./);
    expect(second.getByText('Try saving again')).toBeTruthy();
  });

  it('goes back for another attempt and hands the report to the assistant', async () => {
    const { navigation, result } = await renderReport();
    await fireEvent.press(screen.getByTestId('quality-retry'));
    expect(navigation.goBack).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('quality-ask-assistant'));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'AIAssistant',
      params: {
        attach: {
          type: 'analysis',
          kind: 'image_quality',
          title: 'Image quality report',
          data: expect.objectContaining({ overallScore: result.overallScore, width: 3000, height: 4000 }),
        },
      },
    });
  });
});
