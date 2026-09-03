/**
 * components/shared/LimiteDeError.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Error Boundary" de React (clase, porque la API de Error Boundaries
 * aún requiere un componente de clase; no existe equivalente en hooks).
 *
 * Última línea de defensa del requisito "lógica indestructible": si por
 * cualquier motivo no anticipado un componente lanza una excepción
 * durante el render (por ejemplo, un dato corrupto que ninguna
 * validación previa capturó), este límite evita que TODA la aplicación
 * se caiga con una pantalla blanca, mostrando en su lugar una pantalla
 * de recuperación amigable con opción de volver a intentar.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AvisoError } from './AvisoError';

interface Propiedades {
  children: ReactNode;
}

interface Estado {
  tieneError: boolean;
}

export class LimiteDeError extends Component<Propiedades, Estado> {
  constructor(props: Propiedades) {
    super(props);
    this.state = { tieneError: false };
  }

  static getDerivedStateFromError(): Estado {
    // Se ejecuta durante la fase de "render": marcamos el estado para
    // que el siguiente render muestre el fallback en lugar del árbol roto.
    return { tieneError: true };
  }

  componentDidCatch(error: Error, infoError: ErrorInfo): void {
    // Se ejecuta durante la fase de "commit": aquí es seguro hacer
    // logging (efectos secundarios). En una app real, este es el punto
    // donde se enviaría el error a un servicio de monitoreo.
    console.error('[LimiteDeError] Error no controlado capturado:', error, infoError);
  }

  private reiniciar = (): void => {
    this.setState({ tieneError: false });
  };

  render() {
    if (this.state.tieneError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-cuento-bg">
          <AvisoError
            titulo="¡Vaya! El cuento tropezó"
            mensaje="Algo inesperado ocurrió. No te preocupes, puedes volver a intentarlo."
            onReintentar={this.reiniciar}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
