import { useLayoutEffect, useRef, useState } from 'react';
import './HojaAnimada.css';

type Pagina = { imagen: string; numero: number };
type Giro = { anterior: Pagina; nueva: Pagina; adelante: boolean };

export function HojaAnimada({ imagen, numero, arrastre, animacion, onAnimando }: {
  imagen: string; numero: number; arrastre: number; animacion: boolean; onAnimando: (valor: boolean) => void;
}) {
  const anterior = useRef<Pagina | null>(null);
  const [giro, setGiro] = useState<Giro | null>(null);
  useLayoutEffect(() => {
    const nueva = { imagen, numero };
    const previa = anterior.current;
    anterior.current = nueva;
    if (!previa || previa.numero === numero) return;
    if (!animacion) {
      setGiro(null); onAnimando(false); return;
    }
    setGiro({ anterior: previa, nueva, adelante: numero > previa.numero });
    onAnimando(true);
    // Also release controls if an animation event is interrupted by the browser.
    const timer = window.setTimeout(() => { setGiro(null); onAnimando(false); }, 850);
    return () => window.clearTimeout(timer);
  }, [imagen, numero, animacion, onAnimando]);
  const terminar = () => { setGiro(null); onAnimando(false); };
  const fondo = giro && !giro.adelante ? giro.anterior.imagen : imagen;
  const hoja = giro?.adelante ? giro.anterior.imagen : giro?.nueva.imagen;
  return <div className="libro-perspectiva" data-animacion={animacion} style={{ transform: giro ? undefined : `translateX(${arrastre * 0.3}px)` }}>
    <div className="libro-papel">
      <img className="libro-pagina" src={fondo} alt={`Página ${numero}`} draggable={false} />
      {giro && <>
        <div key={`sombra-${numero}`} className="libro-sombra" aria-hidden="true" />
        <div key={numero} aria-hidden="true" className={`libro-hoja ${giro.adelante ? 'libro-hoja-sale' : 'libro-hoja-entra'}`} onAnimationEnd={evento => { if (evento.target === evento.currentTarget) terminar(); }}>
          <img src={hoja} alt="" draggable={false} />
          <div className="libro-pliegue" />
        </div>
      </>}
      <div className="libro-lomo" aria-hidden="true" />
    </div>
  </div>;
}
