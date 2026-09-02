import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';
import './ui/maxroll.css';
import './ui/gear-coach.css';
import './ui/v020.css';
import './ui/reliability.css';
import './ui/responsive.css';
import './ui/lab.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
