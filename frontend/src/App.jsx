import { useEffect, useState } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function App() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadMessage() {
      try {
        const response = await fetch(`${API_BASE_URL}/hello`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const text = await response.text();
        setMessage(text);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          setError('Nao foi possivel carregar a mensagem.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadMessage();

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <h1 className="text-4xl font-bold text-center">
        {loading ? 'Carregando...' : error ? error : message}
      </h1>
    </main>
  );
}

export default App;
