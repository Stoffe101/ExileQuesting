import { registerBuildDoctorIpc } from './services/build-doctor-ipc';
import { installCaptureSafeWindowPolicy } from './services/capture-safe-policy';
import { registerPassivesAuditIpc } from './services/passives-audit-ipc';

installCaptureSafeWindowPolicy();

import './main';

registerPassivesAuditIpc();
registerBuildDoctorIpc();
