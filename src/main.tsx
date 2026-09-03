import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';
import './ui/maxroll.css';
import './ui/gear-coach.css';
import './ui/build-doctor.css';
import './ui/build-doctor-dependencies.css';
import './ui/v020.css';
import './ui/reliability.css';
import './ui/responsive.css';
import './ui/lab.css';
import './ui/passive-tree-hud.css';

const rendererMode = new URLSearchParams(window.location.search).get('mode') ?? 'manager';
document.documentElement.dataset.mode = rendererMode;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
