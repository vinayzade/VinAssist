import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import * as ImagePicker from 'react-native-image-picker';
import { sessionStarted } from '@/features/auth';
import { ImageQualityResultScreen, ImageQualityScreen } from '@/features/imageQuality';
import {
  ImageQualityError,
  NativeImageQualityService,
  THRESHOLDS,
  getImageQualityService,
  scoreBlur,
  scoreBrightness,
  scoreImageQuality,
  setImageQualityService,
  toMetrics,
  type ImageMetrics,
  type ImageQualityService,
} from '@/services/imageQuality';
import type { ImageQualityModule, NativeImageMetrics } from '@/native';
import { setupStore } from '@/store';
import { ThemeProvider, lightTheme } from '@/theme';

/* -------------------------------- fixtures -------------------------------- */

/** A sharp, well-lit 12 MP photo with one centred face. */
function goodMetrics(overrides: Partial<ImageMetrics> = {}): ImageMetrics {
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

const codes = (r: ReturnType<typeof scoreImageQuality>) => r.warnings.map(w => w.code);

/* --------------------------------- scoring --------------------------------- */

describe('scoring', () => {
  it('rates a sharp, well-lit, high-resolution portrait as GOOD with no warnings', () => {
    const result = scoreImageQuality(goodMetrics(), 'portrait');

    expect(result.status).toBe('GOOD');
    expect(result.overallScore).toBeGreaterThanOrEqual(90);
    expect(result.warnings).toEqual([]);
    expect(result.checks).toEqual({
      faceDetected: true,
      blur: false,
      lowLight: false,
      overexposed: false,
      multipleFaces: false,
      faceOutsideFrame: false,
      resolution: 'GOOD',
    });
    expect(result.faceCount).toBe(1);
    expect(result.recommendation).toMatch(/Looks good/);
  });

  it('produces the documented response shape', () => {
    const result = scoreImageQuality(goodMetrics({ meanLuma: 85 }), 'portrait');

    expect(result).toMatchObject({
      overallScore: expect.any(Number),
      status: 'GOOD',
      blurScore: expect.any(Number),
      brightnessScore: expect.any(Number),
      resolutionScore: expect.any(Number),
      faceScore: 100,
      faceDetected: true,
      faceCount: 1,
      checks: { faceDetected: true, blur: false, lowLight: false, resolution: 'GOOD' },
      warnings: [expect.objectContaining({ message: 'Background lighting could be improved.' })],
      recommendation: expect.stringContaining('Background lighting'),
    });
  });

  it('flags blur and caps the score below GOOD', () => {
    const result = scoreImageQuality(goodMetrics({ laplacianVariance: 40 }));

    expect(result.checks.blur).toBe(true);
    expect(codes(result)).toContain('blur');
    expect(result.status).not.toBe('GOOD');
    expect(result.recommendation).toMatch(/blurry/i);
  });

  it('warns softly between blurry and sharp so the bar colour and text agree', () => {
    // variance 200 -> score ~59: not "blurry", but not clean either.
    const result = scoreImageQuality(goodMetrics({ laplacianVariance: 200 }));
    expect(result.checks.blur).toBe(false);
    expect(codes(result)).toEqual(['soft-focus']);
    expect(result.recommendation).toMatch(/slightly soft/i);
  });

  it('blur score is monotonic in Laplacian variance and bounded', () => {
    expect(scoreBlur(0)).toBe(0);
    expect(scoreBlur(THRESHOLDS.blur.floorVariance)).toBeLessThan(5);
    expect(scoreBlur(100)).toBeGreaterThan(scoreBlur(40));
    expect(scoreBlur(5000)).toBe(100);
  });

  it('flags low light from mean luma or crushed shadows', () => {
    const dark = scoreImageQuality(goodMetrics({ meanLuma: 50, darkPixelRatio: 0.6 }));
    expect(dark.checks.lowLight).toBe(true);
    expect(codes(dark)).toContain('low-light');
    expect(dark.status).not.toBe('GOOD');

    const shadows = scoreImageQuality(goodMetrics({ meanLuma: 100, darkPixelRatio: 0.5 }));
    expect(shadows.checks.lowLight).toBe(true);
  });

  it('flags overexposure from mean luma or clipped highlights', () => {
    const bright = scoreImageQuality(goodMetrics({ meanLuma: 210 }));
    expect(bright.checks.overexposed).toBe(true);
    expect(codes(bright)).toContain('overexposed');

    const clipped = scoreImageQuality(goodMetrics({ meanLuma: 150, brightPixelRatio: 0.2 }));
    expect(clipped.checks.overexposed).toBe(true);
    expect(scoreBrightness(clipped.metrics)).toBeLessThan(scoreBrightness(goodMetrics()));
  });

  it('grades resolution and warns when it is low', () => {
    const low = scoreImageQuality(goodMetrics({ width: 640, height: 480 }));
    expect(low.checks.resolution).toBe('LOW');
    expect(codes(low)).toContain('low-resolution');

    const ok = scoreImageQuality(goodMetrics({ width: 1280, height: 720 }));
    expect(ok.checks.resolution).toBe('OK');

    expect(scoreImageQuality(goodMetrics()).checks.resolution).toBe('GOOD');
  });

  it('does not penalise a general photo for having no face', () => {
    const result = scoreImageQuality(goodMetrics({ faces: [] }), 'general');

    expect(result.faceDetected).toBe(false);
    expect(result.faceScore).toBeNull();
    expect(result.status).toBe('GOOD');
    expect(codes(result)).not.toContain('no-face');
  });

  it('requires a face for portraits', () => {
    const result = scoreImageQuality(goodMetrics({ faces: [] }), 'portrait');

    expect(result.faceScore).toBe(0);
    expect(codes(result)).toContain('no-face');
    expect(result.status).toBe('POOR');
  });

  it('warns on multiple faces', () => {
    const face = goodMetrics().faces[0];
    const result = scoreImageQuality(
      goodMetrics({ faces: [face, { ...face, frame: { ...face.frame, x: 200 } }] }),
      'portrait',
    );

    expect(result.faceCount).toBe(2);
    expect(result.checks.multipleFaces).toBe(true);
    expect(codes(result)).toContain('multiple-faces');
  });

  it('warns and caps when the face is outside the frame', () => {
    const face = { ...goodMetrics().faces[0], outsideFrame: true };
    const result = scoreImageQuality(goodMetrics({ faces: [face] }), 'portrait');

    expect(result.checks.faceOutsideFrame).toBe(true);
    expect(codes(result)).toContain('face-outside-frame');
    expect(result.status).not.toBe('GOOD');
  });

  it('warns when the face is small, turned away, or eyes are closed', () => {
    const face = goodMetrics().faces[0];
    const result = scoreImageQuality(
      goodMetrics({ faces: [{ ...face, areaRatio: 0.01, yaw: 45, eyesOpen: false }] }),
      'portrait',
    );

    expect(codes(result)).toEqual(
      expect.arrayContaining(['face-too-small', 'face-turned', 'eyes-closed']),
    );
  });

  it('orders the recommendation by severity', () => {
    const result = scoreImageQuality(
      goodMetrics({ laplacianVariance: 20, width: 640, height: 480, meanLuma: 88 }),
    );

    expect(result.status).toBe('POOR');
    expect(result.recommendation).toMatch(/^Retake recommended\. The image is blurry/);
  });
});

/* ----------------------------- native adapter ----------------------------- */

const NATIVE: NativeImageMetrics = {
  width: 1000,
  height: 1000,
  analyzedWidth: 500,
  analyzedHeight: 500,
  laplacianVariance: 700,
  meanLuma: 120,
  lumaStdDev: 50,
  darkPixelRatio: 0.1,
  brightPixelRatio: 0.01,
  faces: [
    { frame: { x: 5, y: 300, width: 300, height: 350 }, yaw: 0, roll: 0, leftEyeOpen: 0.1, rightEyeOpen: 0.2 },
    { frame: { x: 600, y: 300, width: 200, height: 250 }, yaw: 0, roll: 0, leftEyeOpen: 0.9, rightEyeOpen: 0.9 },
  ],
  faceDetectionRan: true,
  durationMs: 99,
};

describe('NativeImageQualityService', () => {
  it('derives face area, edge contact and eye state from native frames', () => {
    const metrics = toMetrics(NATIVE);

    expect(metrics.faces[0]).toMatchObject({ outsideFrame: true, eyesOpen: false });
    expect(metrics.faces[0].areaRatio).toBeCloseTo(0.105, 3);
    expect(metrics.faces[1]).toMatchObject({ outsideFrame: false, eyesOpen: true });
  });

  it('analyses through the native module and scores the result', async () => {
    const module = { analyze: jest.fn(async () => NATIVE) } as unknown as ImageQualityModule;
    const service = new NativeImageQualityService(module);

    const result = await service.analyze({ uri: 'file:///p.jpg' }, { subject: 'portrait' });

    expect(module.analyze).toHaveBeenCalledWith('file:///p.jpg', { detectFaces: true });
    expect(result.faceCount).toBe(2);
    expect(result.checks.multipleFaces).toBe(true);
    expect(result.checks.faceOutsideFrame).toBe(true);
    expect(result.engine).toBe('on-device');
  });

  it('maps native errors and reports unavailability', async () => {
    const failing = {
      analyze: jest.fn(async () => {
        throw Object.assign(new Error('x'), { code: 'E_UNREADABLE' });
      }),
    } as unknown as ImageQualityModule;
    await expect(new NativeImageQualityService(failing).analyze({ uri: 'u' })).rejects.toMatchObject({
      code: 'unreadable',
    });

    const missing = new NativeImageQualityService(null);
    expect(missing.isAvailable()).toBe(false);
    await expect(missing.analyze({ uri: 'u' })).rejects.toBeInstanceOf(ImageQualityError);
  });

  it('is swappable through the locator', () => {
    const custom: ImageQualityService = {
      engine: 'fake',
      isAvailable: () => true,
      analyze: async () => scoreImageQuality(goodMetrics()),
    };
    setImageQualityService(custom);
    expect(getImageQualityService()).toBe(custom);
    setImageQualityService(null);
    expect(getImageQualityService()).toBeInstanceOf(NativeImageQualityService);
  });
});

/* ---------------------------------- screens ---------------------------------- */

const picker = (ImagePicker as unknown as { __mock: { next: unknown } }).__mock;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(ui: React.ReactElement, store = setupStore()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const flush = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() } as never;
const nav = navigation as { navigate: jest.Mock; goBack: jest.Mock };

describe('ImageQualityScreen', () => {
  let analyze: jest.Mock;
  beforeEach(() => {
    analyze = jest.fn(async () => scoreImageQuality(goodMetrics()));
    setImageQualityService({ engine: 'fake', isAvailable: () => true, analyze });
    nav.navigate.mockClear();
  });
  afterEach(() => setImageQualityService(null));

  it('analyses a scanned image with the chosen subject and opens the report', async () => {
    render(
      <ImageQualityScreen
        navigation={navigation}
        route={{ key: 'k', name: 'ImageQuality', params: { imageUri: 'file:///s.jpg' } }}
      />,
    );
    await flush();

    expect(analyze).toHaveBeenCalledWith({ uri: 'file:///s.jpg' }, { subject: 'general' });
    expect(nav.navigate).toHaveBeenCalledWith(
      'ImageQualityResult',
      expect.objectContaining({ imageUri: 'file:///s.jpg' }),
    );
  });

  it('lets the user switch to portrait mode and pick from the gallery', async () => {
    picker.next = {
      assets: [{ uri: 'file:///g.jpg', fileName: 'g.jpg', fileSize: 1000, type: 'image/jpeg', width: 10, height: 10 }],
    };
    const tree = render(
      <ImageQualityScreen navigation={navigation} route={{ key: 'k', name: 'ImageQuality', params: undefined }} />,
    );

    act(() => host(tree, 'image-quality-subject-portrait').props.onClick());
    await act(async () => host(tree, 'image-quality-choose').props.onClick());
    expect(has(tree, 'image-quality-preview')).toBe(true);
    await act(async () => host(tree, 'image-quality-analyze').props.onClick());

    expect(analyze).toHaveBeenCalledWith({ uri: 'file:///g.jpg' }, { subject: 'portrait' });
  });

  it('routes the camera to the scanner with this tool as target', () => {
    const tree = render(
      <ImageQualityScreen navigation={navigation} route={{ key: 'k', name: 'ImageQuality', params: undefined }} />,
    );
    act(() => host(tree, 'image-quality-capture').props.onClick());
    expect(nav.navigate).toHaveBeenCalledWith('Scanner', { target: 'ImageQuality' });
  });

  it('shows errors inline', async () => {
    analyze.mockRejectedValueOnce(new ImageQualityError('Could not read that image.', 'unreadable'));
    const tree = render(
      <ImageQualityScreen
        navigation={navigation}
        route={{ key: 'k', name: 'ImageQuality', params: { imageUri: 'file:///bad.jpg' } }}
      />,
    );
    await flush();
    expect(textOf(tree, 'image-quality-error')).toBe('Could not read that image.');
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

describe('ImageQualityResultScreen', () => {
  const calls: Request[] = [];
  let responder: () => Response = () => new Response('Not Found', { status: 404 });
  beforeAll(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      calls.push(req);
      return responder();
    }) as typeof fetch;
  });
  beforeEach(() => {
    calls.length = 0;
    responder = () => new Response('Not Found', { status: 404 });
    nav.goBack.mockClear();
  });

  const route = (result = scoreImageQuality(goodMetrics({ meanLuma: 85 }), 'portrait')) =>
    ({ key: 'k', name: 'ImageQualityResult', params: { imageUri: 'file:///a.jpg', result } }) as never;

  it('renders status, score, chips and warnings', () => {
    const tree = render(<ImageQualityResultScreen navigation={navigation} route={route()} />);

    expect(textOf(tree, 'quality-status')).toBe('Good quality');
    expect(Number(textOf(tree, 'quality-score'))).toBeGreaterThanOrEqual(75);
    expect(has(tree, 'quality-warnings')).toBe(true);
    expect(has(tree, 'chip-face')).toBe(true);
    expect(textOf(tree, 'quality-recommendation')).toMatch(/Background lighting/);
  });

  it('saves to history and the backend', async () => {
    responder = () =>
      new Response(
        JSON.stringify({ id: 'q1', score: 84, status: 'GOOD', blur: 'none', exposure: 'good', issues: [], engine: 'on-device', createdAt: 'now' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    const store = setupStore();
    store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
    const tree = render(<ImageQualityResultScreen navigation={navigation} route={route()} />, store);

    await act(async () => host(tree, 'quality-save').props.onClick());
    await flush();

    expect(store.getState().history.items[0]).toMatchObject({ kind: 'imageQuality' });
    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/image-quality/results');
    const body = await calls[0].json();
    expect(body).toMatchObject({ status: 'GOOD', faceCount: 1, engine: 'on-device' });
    expect(body.warnings).toEqual(['Background lighting could be improved.']);
    expect(has(tree, 'quality-save-error')).toBe(false);
  });

  it('keeps the local save when the backend fails', async () => {
    const store = setupStore();
    const tree = render(<ImageQualityResultScreen navigation={navigation} route={route()} />, store);

    await act(async () => host(tree, 'quality-save').props.onClick());
    await flush();

    expect(store.getState().history.items).toHaveLength(1);
    expect(textOf(tree, 'quality-save-error')).toMatch(/Saved on this device/);
  });

  it('goes back for another attempt', () => {
    const tree = render(<ImageQualityResultScreen navigation={navigation} route={route()} />);
    act(() => host(tree, 'quality-retry').props.onClick());
    expect(nav.goBack).toHaveBeenCalled();
  });
});
