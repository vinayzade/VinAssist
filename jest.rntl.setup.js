/* eslint-env jest */
// React Native Testing Library defaults: the app's flows involve a few
// awaited effects (keychain, RTK Query), so allow a little more than 1 s.
const { configure } = require('@testing-library/react-native');

configure({ asyncUtilTimeout: 5000 });
