import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './responsive.css';
import { Chart } from 'chart.js';

Chart.defaults.font.size = 14;
Chart.defaults.color = '#475569';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

