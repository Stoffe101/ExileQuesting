import { registerBuildDoctorIpc } from './services/build-doctor-ipc';
import { registerPassivesAuditIpc } from './services/passives-audit-ipc';
import './main';

registerPassivesAuditIpc();
registerBuildDoctorIpc();
