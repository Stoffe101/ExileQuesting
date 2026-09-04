import { registerPassivesAuditIpc } from './services/passives-audit-ipc';
import { installCaptureSafeWindowPolicy } from './services/capture-safe-policy';
import { installTargetLockGlobalShortcutPolicy } from './services/global-shortcut-policy';

installCaptureSafeWindowPolicy();
installTargetLockGlobalShortcutPolicy();
require('./main');
registerPassivesAuditIpc();
