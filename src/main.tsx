import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import ManagerV2 from './ui/ManagerV2';
import './ui/styles.css';
import './ui/maxroll.css';
import './ui/gear-coach.css';
import './ui/build-doctor.css';
import './ui/build-doctor-dependencies.css';
import './ui/build-doctor-candidate.css';
import './ui/build-doctor-metric-changes.css';
import './ui/build-doctor-passive-contribution.css';
import './ui/v020.css';
import './ui/reliability.css';
import './ui/responsive.css';
import './ui/lab.css';

const rendererMode = new URLSearchParams(window.location.search).get('mode') ?? 'manager';
document.documentElement.dataset.mode = rendererMode;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {rendererMode === 'manager' ? <ManagerV2 /> : <App />}
  </StrictMode>,
);
