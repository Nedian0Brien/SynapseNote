import ReactDOM from 'react-dom/client';

import '@/i18n/config';
import App from '@/components/main/App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
