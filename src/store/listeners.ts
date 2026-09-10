import { registerAuthListeners } from '@/features/auth/store/authListeners';
import { registerSettingsListeners } from '@/features/settings/store/settingsListeners';

let registered = false;

/**
 * Registers every feature's listener-middleware effects exactly once. Called
 * from `AppProviders` so the effects are active before the first render.
 */
export function registerAppListeners() {
  if (registered) {
    return;
  }
  registered = true;
  registerAuthListeners();
  registerSettingsListeners();
}
