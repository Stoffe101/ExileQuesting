import { registerPassivesAuditIpc } from './services/passives-audit-ipc';
import { installCaptureSafeWindowPolicy } from './services/capture-safe-policy';

installCaptureSafeWindowPolicy();
require('./main');
registerPassivesAuditIpc();
