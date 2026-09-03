/**
 * App.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Componente raíz. Gestiona la navegación entre las DOS vistas principales
 * de la app —Biblioteca y Lector— mediante un estado simple en memoria.
 *
 * DECISIÓN DE ARQUITECTURA: no usamos un router (react-router) porque la
 * app tiene solo dos "pantallas" conceptuales y no hay necesidad real de
 * URLs profundas por libro/página en esta primera versión. Introducir un
 * router aquí sería sobre-ingeniería (violación del principio YAGNI).
 * Si en el futuro se necesitara compartir enlaces directos a un libro,
 * este es el único archivo que habría que tocar para migrar a rutas.
 *
 * Todo el árbol se envuelve en `LimiteDeError` para cumplir el requisito
 * de robustez "indestructible": ningún error de render escapa a una
 * pantalla en blanco.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import type { Libro, ProgresoLectura } from './types/libro';
import { PantallaBiblioteca } from './components/library/PantallaBiblioteca';
import { PantallaLector } from './components/reader/PantallaLector';
import { LimiteDeError } from './components/shared/LimiteDeError';

/** Las dos vistas posibles de la aplicación. */
type Vista = { nombre: 'biblioteca' } | { nombre: 'lector'; libro: Libro };

function App() {
  const [vista, setVista] = useState<Vista>({ nombre: 'biblioteca' });

  const abrirLibro = useCallback((libro: Libro) => {
    setVista({ nombre: 'lector', libro });
  }, []);

  const volverABiblioteca = useCallback(() => {
    setVista({ nombre: 'biblioteca' });
  }, []);

  /**
   * Callback "puente": cuando el lector actualiza el progreso de lectura,
   * no necesitamos hacer nada especial aquí porque cada pantalla gestiona
   * su propio estado (el hook `useBiblioteca` se re-monta al volver a la
   * biblioteca y relee IndexedDB). Se deja el hook preparado por si en el
   * futuro se decide compartir un estado global de progreso en tiempo
   * real entre ambas vistas sin necesidad de desmontar/remontar.
   */
  const manejarProgresoActualizado = useCallback((_progreso: ProgresoLectura) => {
    // Intencionalmente vacío: ver comentario superior.
  }, []);

  return (
    <LimiteDeError>
      {vista.nombre === 'biblioteca' && (
        <PantallaBiblioteca onAbrirLibro={abrirLibro} />
      )}

      {vista.nombre === 'lector' && (
        <PantallaLector
          key={vista.libro.id}
          libro={vista.libro}
          onCerrar={volverABiblioteca}
          onProgresoActualizado={manejarProgresoActualizado}
        />
      )}
    </LimiteDeError>
  );
}

export default App;
