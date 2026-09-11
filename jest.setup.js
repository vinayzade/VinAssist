/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

// Gesture Handler: replaces native gesture modules with JS mocks.
require('react-native-gesture-handler/jestSetup');

// Reanimated: JS-only mock so components using Animated.* render under Jest.
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

// react-native-config resolves values at native build time; under Jest we
// feed it the committed development env file so tests track real config.
jest.mock('react-native-config', () => {
  const fs = require('fs');
  const path = require('path');
  const raw = fs.readFileSync(path.join(__dirname, '.env.development'), 'utf8');
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([\w.-]+)\s*=\s*['"]?(.*?)['"]?\s*$/,
    );
    if (match && !line.trim().startsWith('#')) {
      values[match[1]] = match[2];
    }
  }
  return { __esModule: true, default: values, Config: values };
});

// react-native-keychain: in-memory stand-in for Keychain / Keystore, keyed by
// `service` so separate tokens stay separate. Exposes __reset for tests.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  const enums = {
    ACCESSIBLE: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY:
        'AccessibleAfterFirstUnlockThisDeviceOnly',
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    },
    STORAGE_TYPE: {
      AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth',
      AES_GCM: 'KeystoreAESGCM',
    },
    SECURITY_LEVEL: { ANY: 0, SECURE_SOFTWARE: 1, SECURE_HARDWARE: 2 },
  };
  const serviceOf = options => (options && options.service) || 'default';
  return {
    __esModule: true,
    ...enums,
    __store: store,
    __reset: () => store.clear(),
    setGenericPassword: jest.fn(async (username, password, options) => {
      const service = serviceOf(options);
      store.set(service, { username, password, options });
      return {
        service,
        storage: (options && options.storage) || 'KeystoreAESGCM_NoAuth',
      };
    }),
    getGenericPassword: jest.fn(async options => {
      const entry = store.get(serviceOf(options));
      return entry
        ? {
            username: entry.username,
            password: entry.password,
            service: serviceOf(options),
            storage: 'KeystoreAESGCM_NoAuth',
          }
        : false;
    }),
    resetGenericPassword: jest.fn(async options =>
      store.delete(serviceOf(options)),
    ),
    hasGenericPassword: jest.fn(async options => store.has(serviceOf(options))),
  };
});

// react-native-vision-camera: controllable stand-in. Tests drive permission
// status, available devices, and capture results through `__mock`.
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const state = {
    permission: 'authorized',
    devices: {
      back: { id: 'back-1', position: 'back', hasFlash: true, hasTorch: true },
      front: {
        id: 'front-1',
        position: 'front',
        hasFlash: false,
        hasTorch: false,
      },
    },
    captureResult: { filePath: '/tmp/photo.jpg' },
    captureError: null,
    captures: [],
    requestResult: true,
  };
  const photoOutput = {
    capturePhotoToFile: jest.fn(async settings => {
      state.captures.push(settings);
      if (state.captureError) {
        throw state.captureError;
      }
      return state.captureResult;
    }),
  };
  const Camera = props => {
    React.useEffect(() => {
      props.onPreviewStarted?.();
      return () => props.onPreviewStopped?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
    }, []);
    return React.createElement(View, {
      testID: 'vision-camera',
      accessibilityLabel: `camera:${props.device?.position}:${
        props.isActive ? 'active' : 'inactive'
      }`,
    });
  };
  return {
    __esModule: true,
    __mock: state,
    Camera,
    useCameraDevice: position => state.devices[position],
    usePhotoOutput: () => photoOutput,
    useCameraPermission: () => {
      const [status, setStatus] = React.useState(state.permission);
      return {
        status,
        hasPermission: status === 'authorized',
        canRequestPermission: status === 'not-determined',
        requestPermission: jest.fn(async () => {
          state.permission = state.requestResult ? 'authorized' : 'denied';
          setStatus(state.permission);
          return state.requestResult;
        }),
      };
    },
  };
});

jest.mock('react-native-nitro-modules', () => ({ callback: fn => fn }));

// react-native-image-picker: resolve with whatever the test queued.
jest.mock('react-native-image-picker', () => {
  const state = { next: { didCancel: true } };
  return {
    __esModule: true,
    __mock: state,
    launchImageLibrary: jest.fn(async () => state.next),
  };
});

// @react-native-documents/picker: tests queue the next result via `__mock`.
jest.mock('@react-native-documents/picker', () => {
  const errorCodes = {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
  };
  const state = { next: null, lastOptions: null };
  return {
    __esModule: true,
    __mock: state,
    errorCodes,
    isErrorWithCode: e => Boolean(e && typeof e.code === 'string'),
    types: { pdf: 'application/pdf', images: 'image/*', allFiles: '*/*' },
    pick: jest.fn(async options => {
      state.lastOptions = options;
      const next = state.next;
      if (next instanceof Error) {
        throw next;
      }
      if (!next) {
        throw Object.assign(new Error('cancelled'), {
          code: errorCodes.OPERATION_CANCELED,
        });
      }
      return Array.isArray(next) ? next : [next];
    }),
  };
});

// @react-native-clipboard/clipboard: in-memory clipboard.
jest.mock('@react-native-clipboard/clipboard', () => {
  const state = { value: '' };
  return {
    __esModule: true,
    __mock: state,
    default: {
      setString: jest.fn(text => {
        state.value = text;
      }),
      getString: jest.fn(async () => state.value),
      hasString: jest.fn(async () => state.value.length > 0),
    },
  };
});
