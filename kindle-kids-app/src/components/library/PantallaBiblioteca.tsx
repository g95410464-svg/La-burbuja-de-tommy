import { useState } from 'react';
import { ArrowRight, BookOpen, Check, Clock3, Library, LogOut, Monitor, Plus, Search, Sparkles, X } from 'lucide-react';
import { useBiblioteca } from '../../hooks/useBiblioteca';
import { TarjetaLibro } from './TarjetaLibro';
import { ModalSubirLibro } from '../upload/ModalSubirLibro';
import { CargandoCuento } from '../shared/CargandoCuento';
import { MundoLibros } from '../shared/MundoLibros';
import type { Libro } from '../../types/libro';

type Filtro = 'todos' | 'leyendo' | 'terminados';
export function PantallaBiblioteca({ onAbrirLibro, onSalir, nombre, preview }: {
  onAbrirLibro: (libro: Libro) => void; onSalir: () => void; nombre: string; preview: boolean;
}) {
  const { libros, progresoPorLibro, cargando, error, agregarLibro, eliminarLibro } = useBiblioteca();
  const [subida, setSubida] = useState(false);
  const [borrar, setBorrar] = useState<Libro | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visibles = libros.filter(l => normalizar(`${l.titulo} ${l.autor || ''}`).includes(normalizar(busqueda)) &&
    (filtro === 'todos' || (filtro === 'terminados' ? progresoPorLibro[l.id]?.completado : progresoPorLibro[l.id] && !progresoPorLibro[l.id].completado)));
  const continuar = [...libros].filter(l => progresoPorLibro[l.id] && !progresoPorLibro[l.id].completado)
    .sort((a, b) => progresoPorLibro[b.id].ultimaLectura.localeCompare(progresoPorLibro[a.id].ultimaLectura))[0];
  const completados = libros.filter(l => progresoPorLibro[l.id]?.completado).length;
  const confirmar = async () => {
    if (!borrar || borrando) return;
    setBorrando(true); setErrorBorrar('');
    const resultado = await eliminarLibro(borrar.id);
    setBorrando(false);
    if (resultado.ok) setBorrar(null); else setErrorBorrar(resultado.error);
  };
  return <div className="biblioteca">
    <header className="cabecera"><div className="cabecera-interior">
      <a className="marca" href="/" aria-label="Cuentitos, inicio"><span className="marca-icono"><BookOpen size={23} /></span><span>Cuentitos<span className="marca-punto">.</span></span></a>
      <span className="cabecera-seccion"><Library size={18} /> Mi biblioteca</span>
      <button className="boton-perfil" onClick={onSalir} title={preview ? 'Salir de la vista previa' : 'Cerrar sesión'}><span className="avatar">{preview ? 'L' : nombre.slice(0, 1).toUpperCase()}</span><span>{preview ? 'Vista previa' : nombre}</span><LogOut size={17} /></button>
    </div></header>
    <main className="biblioteca-contenido">
      {preview && <p className="aviso-preview">Vista previa local · Las cuentas se activarán al conectar Supabase.</p>}
      <section className="bienvenida"><div><span className="etiqueta"><Sparkles size={14} /> UN RATITO PARA IMAGINAR</span><h1>{preview ? 'Hola, pequeño lector' : `Hola, ${nombre}`}<span className="saludo-punto">.</span></h1><p>Hoy es un buen día para descubrir una historia.</p></div><button className="boton-principal" onClick={() => setSubida(true)}><Plus size={19} /> Agregar cuento</button></section>
      <section className="hero-lectura"><div className="hero-texto"><span className="etiqueta">{continuar ? 'TU HISTORIA TE ESTÁ ESPERANDO' : 'ABRE UN LIBRO. ABRE UN MUNDO.'}</span><h2>{continuar ? continuar.titulo : <>Las grandes aventuras<br />empiezan con una página.</>}</h2><p>{continuar ? `Te quedaste en la página ${progresoPorLibro[continuar.id].paginaActual}. ¿Seguimos?` : 'Dragones, planetas y bosques secretos. Tu próxima aventura cabe en esta biblioteca.'}</p><button className="boton-principal" onClick={() => continuar ? onAbrirLibro(continuar) : setSubida(true)}>{continuar ? 'Continuar leyendo' : libros.length ? 'Agregar otro cuento' : 'Agregar mi primer cuento'}<ArrowRight size={18} /></button></div><MundoLibros /></section>
      <section className="estanteria" aria-labelledby="titulo-biblioteca"><div className="titulo-estanteria"><div><span className="etiqueta">TU PEQUEÑO UNIVERSO</span><h2 id="titulo-biblioteca">Mis cuentos <span>{libros.length}</span></h2></div><label className="buscador"><Search size={19} /><input aria-label="Buscar un cuento" placeholder="Buscar un cuento…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />{busqueda && <button aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')}><X size={17} /></button>}</label></div>
      <div className="filtros" aria-label="Filtrar cuentos">{([{ id: 'todos', texto: 'Todos', Icono: Library }, { id: 'leyendo', texto: 'Leyendo', Icono: Clock3 }, { id: 'terminados', texto: 'Terminados', Icono: Check }] as const).map(({ id, texto, Icono }) => <button key={id} aria-pressed={filtro === id} className={filtro === id ? 'seleccionado' : ''} onClick={() => setFiltro(id)}><Icono size={16} />{texto}{id === 'terminados' && completados > 0 && ` · ${completados}`}</button>)}</div>
      {error && <p role="alert" className="mensaje-error">{error}</p>}
      {cargando ? <CargandoCuento mensaje="Abriendo tu biblioteca…" /> : visibles.length ? <div className="libros-grid">{visibles.map((libro, indice) => <TarjetaLibro key={libro.id} libro={libro} progreso={progresoPorLibro[libro.id]} onAbrir={onAbrirLibro} onEliminar={libro.origen === 'subido-por-usuario' ? l => { setErrorBorrar(''); setBorrar(l); } : undefined} indice={indice} />)}</div> : <div className="biblioteca-vacia"><span className="vacio-icono"><BookOpen size={32} strokeWidth={1.5} /></span><h3>{libros.length ? 'Aún no hay cuentos aquí' : 'Aquí comienza tu colección'}</h3><p>{busqueda ? 'Prueba con otro título o nombre de autor.' : libros.length ? 'Los cuentos aparecerán aquí cuando avances en tu lectura.' : 'Agrega un cuento en PDF y haz de este rincón tu lugar favorito.'}</p>{!libros.length && <button className="enlace" onClick={() => setSubida(true)}><Plus size={17} /> Agregar un cuento</button>}</div>}
      </section><footer className="pie-biblioteca"><span><Monitor size={16} /> Guardado en este dispositivo</span><span>Una página a la vez, un mundo por descubrir.</span></footer>
    </main>
    <ModalSubirLibro abierto={subida} onCerrar={() => setSubida(false)} onLibroAgregado={agregarLibro} />
    {borrar && <div className="modal-fondo"><section className="confirmacion" role="alertdialog" aria-modal="true" aria-labelledby="titulo-borrar" aria-describedby="detalle-borrar" onKeyDown={e => { if (e.key === 'Escape' && !borrando) setBorrar(null); if (e.key === 'Tab') { const buttons = e.currentTarget.querySelectorAll('button'); const primero = buttons[0]; const ultimo = buttons[buttons.length - 1]; if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); } else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); } } }}><h2 id="titulo-borrar">¿Eliminar este cuento?</h2><p id="detalle-borrar">Se eliminarán «{borrar.titulo}» y su progreso de este dispositivo. No se puede deshacer.</p>{errorBorrar && <p role="alert">{errorBorrar}</p>}<div><button autoFocus disabled={borrando} className="boton-secundario" onClick={() => setBorrar(null)}>Conservar cuento</button><button disabled={borrando} className="boton-principal" onClick={confirmar}>{borrando ? 'Eliminando…' : 'Eliminar'}</button></div></section></div>}
  </div>;
}
