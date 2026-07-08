import { useEffect, useState } from 'react';
import { api } from './lib/api';

// Widget discreto do topo: cidade (por IP), hora de Brasília e temperatura.
export default function ContextBadge() {
  const [geo, setGeo] = useState<{ city: string | null; temperature: number | null } | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    let alive = true;
    const fetchGeo = () =>
      api.metaContext()
        .then((r) => { if (alive) setGeo({ city: r.city, temperature: r.temperature }); })
        .catch(() => {});
    fetchGeo();
    const geoTimer = setInterval(fetchGeo, 30 * 60 * 1000); // atualiza temperatura a cada 30 min
    const clockTimer = setInterval(() => setNow(new Date()), 30 * 1000); // relógio
    return () => { alive = false; clearInterval(geoTimer); clearInterval(clockTimer); };
  }, []);

  const time = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <div className="ctx-badge" title="Horário de Brasília">
      {geo?.city && <span className="ctx-city">{geo.city}</span>}
      {geo?.temperature != null && <span className="ctx-temp">{geo.temperature}°</span>}
      <span className="ctx-date">{date}</span>
      <span className="ctx-time">{time}</span>
    </div>
  );
}
