import React from 'react';
import { Image, Linking } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import * as VisionCamera from 'react-native-vision-camera';
import * as ImagePicker from 'react-native-image-picker';
import App from '@/app/App';
import { logout, sessionStarted } from '@/features/auth';
import { getCurrentRouteName, navigationRef } from '@/navigation';
import { store } from '@/store';

type CameraMock = typeof VisionCamera & {
  __mock: {
    permission: 'authorized' | 'not-determined' | 'denied' | 'restricted';
    devices: Record<string, unknown>;
    captureResult: { filePath: string };
    captureError: Error | null;
    captures: { flashMode?: string }[];
    requestResult: boolean;
  };
};
type PickerMock = typeof ImagePicker & { __mock: { next: unknown } };

const camera = (VisionCamera as CameraMock).__mock;
const picker = (ImagePicker as PickerMock).__mock;

const flush = () =>
  act(() => new Promise<void>(resolve => setTimeout(() => resolve(), 0)));

function hosts(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    n => typeof n.type === 'string' && n.props.testID === testID,
  );
}
function host(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  const found = hosts(tree, testID);
  if (found.length === 0) {
    throw new Error(`no host with testID ${testID}`);
  }
  return found[0];
}
async function press(
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  await act(async () => {
    host(tree, testID).props.onClick();
  });
  await flush();
}
function texts(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAllByType('Text' as never).map(n => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  });
}
function cameraLabel(tree: ReactTestRenderer.ReactTestRenderer) {
  return hosts(tree, 'vision-camera')[0]?.props.accessibilityLabel as
    | string
    | undefined;
}

async function openScanner(target?: 'OCR') {
  await act(async () => {
    navigationRef.navigate('Main', {
      screen: 'Scanner',
      params: target ? { target } : undefined,
    });
  });
  await flush();
}
/** Pops everything above the tab host so each test starts from Home. */
async function closeToHome() {
  for (let i = 0; i < 6 && navigationRef.canGoBack(); i += 1) {
    await act(async () => {
      navigationRef.goBack();
    });
    await flush();
  }
  expect(getCurrentRouteName()).toBe('Home');
}

let tree: ReactTestRenderer.ReactTestRenderer;

beforeAll(async () => {
  globalThis.fetch = jest.fn(() => {
    throw new Error('unexpected network call');
  }) as unknown as typeof fetch;
  jest
    .spyOn(Image, 'getSize')
    .mockImplementation((_uri, success) => success(1200, 1600));
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await flush();
  await flush();
  await act(async () => {
    store.dispatch(
      sessionStarted({
        token: 'abc',
        user: { id: '1', name: 'Vin', email: 'vin@example.com' },
      }),
    );
  });
  await flush();
});

afterAll(async () => {
  store.dispatch(logout());
  await flush();
  await act(async () => tree.unmount());
});

beforeEach(() => {
  camera.permission = 'authorized';
  camera.requestResult = true;
  camera.captureError = null;
  camera.captureResult = { filePath: '/tmp/photo.jpg' };
  camera.captures.length = 0;
  picker.next = { didCancel: true };
});

describe('camera permission', () => {
  it('shows the request state, then the preview once granted', async () => {
    camera.permission = 'not-determined';
    await openScanner();
    // Auto-request fires on mount and the mock grants it.
    expect(camera.permission).toBe('authorized');
    expect(hosts(tree, 'vision-camera')).toHaveLength(1);
    await closeToHome();
  });

  it('denied: offers Settings and the gallery instead of a dead end', async () => {
    camera.permission = 'denied';
    await openScanner();
    expect(hosts(tree, 'camera-permission-denied')).toHaveLength(1);
    expect(hosts(tree, 'vision-camera')).toHaveLength(0);

    expect(texts(tree)).toContain('Open Settings');
    await press(tree, 'camera-permission-denied-action');
    expect(Linking.openSettings).toHaveBeenCalled();
    await closeToHome();
  });

  it('restricted: explains and still offers the gallery', async () => {
    camera.permission = 'restricted';
    await openScanner();
    expect(hosts(tree, 'camera-permission-restricted')).toHaveLength(1);
    await closeToHome();
  });
});

describe('camera screen', () => {
  it('renders the back camera active with overlay, guide and controls', async () => {
    await openScanner();
    expect(getCurrentRouteName()).toBe('Scanner');
    expect(cameraLabel(tree)).toBe('camera:back:active');
    expect(hosts(tree, 'camera-guide')).toHaveLength(1);
    expect(hosts(tree, 'camera-controls')).toHaveLength(1);
    expect(texts(tree)).toContain('Align the document within the frame');
    await closeToHome();
  });

  it('shows the target tool as the title when pre-selected', async () => {
    await openScanner('OCR');
    expect(texts(tree)).toContain('Smart OCR');
    await closeToHome();
  });

  it('switches between front and back cameras', async () => {
    await openScanner();
    await press(tree, 'camera-flip');
    expect(cameraLabel(tree)).toBe('camera:front:active');
    // Front camera has no flash: control reports N/A.
    expect(texts(tree)).toContain('Flash N/A');
    await press(tree, 'camera-flip');
    expect(cameraLabel(tree)).toBe('camera:back:active');
    await closeToHome();
  });

  it('cycles flash off -> on -> auto and passes it to capture', async () => {
    await openScanner();
    expect(texts(tree)).toContain('Flash Off');
    await press(tree, 'camera-flash');
    expect(texts(tree)).toContain('Flash On');
    await press(tree, 'camera-flash');
    expect(texts(tree)).toContain('Flash Auto');

    await press(tree, 'camera-shutter');
    expect(camera.captures[0]).toMatchObject({ flashMode: 'auto' });
    expect(getCurrentRouteName()).toBe('ImagePreview');
    await closeToHome();
  });

  it('close returns to the previous screen', async () => {
    await openScanner();
    await press(tree, 'camera-close');
    expect(getCurrentRouteName()).toBe('Home');
  });

  it('surfaces a capture failure without leaving the camera', async () => {
    camera.captureError = new Error('sensor busy');
    await openScanner();
    await press(tree, 'camera-shutter');
    expect(getCurrentRouteName()).toBe('Scanner');
    expect(texts(tree)).toContain(
      'Could not take the photo. Please try again.',
    );
    await closeToHome();
  });
});

describe('capture -> preview -> confirm', () => {
  it('captures, pauses the camera under the preview, and shows the image', async () => {
    await openScanner();
    await press(tree, 'camera-shutter');

    expect(getCurrentRouteName()).toBe('ImagePreview');
    expect(cameraLabel(tree)).toBe('camera:back:inactive');
    const image = host(tree, 'preview-image');
    expect(image.props.source).toEqual({ uri: 'file:///tmp/photo.jpg' });
    expect(texts(tree)).toContain('Just captured · 1200×1600');
    await closeToHome();
  });

  it('retake returns to the live camera', async () => {
    await openScanner();
    await press(tree, 'camera-shutter');
    await press(tree, 'preview-retake');
    expect(getCurrentRouteName()).toBe('Scanner');
    expect(cameraLabel(tree)).toBe('camera:back:active');
    await closeToHome();
  });

  it('with a target, confirm replaces the preview with that tool', async () => {
    await openScanner('OCR');
    await press(tree, 'camera-shutter');
    expect(hosts(tree, 'preview-confirm')).toHaveLength(1);
    await press(tree, 'preview-confirm');

    expect(getCurrentRouteName()).toBe('OCR');
    const route = navigationRef.getCurrentRoute();
    expect(route?.params).toEqual({ imageUri: 'file:///tmp/photo.jpg' });
    // Preview was replaced, so back goes to the camera, not the preview.
    await act(async () => navigationRef.goBack());
    await flush();
    expect(getCurrentRouteName()).toBe('Scanner');
    await closeToHome();
  });

  it('without a target, the user picks a tool from the list', async () => {
    await openScanner();
    await press(tree, 'camera-shutter');
    expect(hosts(tree, 'preview-confirm')).toHaveLength(0);
    expect(hosts(tree, 'preview-targets')).toHaveLength(1);
    await press(tree, 'preview-target-ImageQuality');
    expect(getCurrentRouteName()).toBe('ImageQuality');
    expect(navigationRef.getCurrentRoute()?.params).toEqual({
      imageUri: 'file:///tmp/photo.jpg',
    });
    await closeToHome();
  });
});

describe('gallery', () => {
  it('a picked image goes straight to the preview', async () => {
    picker.next = {
      assets: [
        {
          uri: 'file:///gallery/a.jpg',
          fileName: 'a.jpg',
          fileSize: 240_000,
          width: 800,
          height: 600,
          type: 'image/jpeg',
        },
      ],
    };
    await openScanner();
    await press(tree, 'camera-gallery');
    expect(getCurrentRouteName()).toBe('ImagePreview');
    expect(texts(tree)).toContain('From your gallery · 800×600');
    await closeToHome();
  });

  it('cancelling the picker stays on the camera', async () => {
    picker.next = { didCancel: true };
    await openScanner();
    await press(tree, 'camera-gallery');
    expect(getCurrentRouteName()).toBe('Scanner');
    await closeToHome();
  });

  it('a picker error is shown as a message', async () => {
    picker.next = { errorCode: 'permission', errorMessage: 'denied' };
    await openScanner();
    await press(tree, 'camera-gallery');
    expect(getCurrentRouteName()).toBe('Scanner');
    expect(texts(tree).join(' ')).toMatch(/Photo library access is turned off/);
    await closeToHome();
  });
});
