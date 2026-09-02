import { registerPassivesAuditIpc } from './services/passives-audit-ipc';

registerPassivesAuditIpc();
await import('./main');
