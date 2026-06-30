import React, { useState, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────
// TECHNE · Calculadora de Huella de Carbono para Ventanas
// Demo conceptual v2 — revisada con observaciones técnicas de
// Pablo Martín (Director ASEFAVE)
// ─────────────────────────────────────────────────────────────

const COL = {
  ink: '#14202E', slate: '#3A4A5C', mist: '#6B7B8C', line: '#D8E0E6',
  paper: '#F4F7F9', white: '#FFFFFF', cyan: '#1A9FD4', cyanDeep: '#0E7BA8',
  leaf: '#2E9E6B', amber: '#E0922F', glass: '#BFE3EE',
};

const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const UNIDADES_COMPONENTE = [
  { id: 'kg_kg', label: 'kg CO₂ / kg de producto' },
  { id: 'kg_m',  label: 'kg CO₂ / m lineal' },
  { id: 'kg_m2', label: 'kg CO₂ / m² de ventana' },
  { id: 'kg_ud', label: 'kg CO₂ / unidad' },
];

const COMPONENTE_DEFAULT = (nombre) => ({
  nombre, activo: true, valor: 0, unidad: 'kg_m2', peso: 0, cantidad: 1,
  origen: null, // null | 'manual' | 'pdf'
  archivoNombre: null,
  leyendo: false,
});

// Valores que "extraería" la IA al simular la lectura de una DAP real,
// según el tipo de componente — para que la demo se sienta creíble.
const EXTRACCION_SIMULADA = {
  Perfil:             { valor: 8.4,  unidad: 'kg_m',  pagina: 'pág. 4, tabla "Resultados A1-A3"',      archivo: 'DAP_Perfil_Aluminio_RPT.pdf' },
  Vidrio:             { valor: 25.0, unidad: 'kg_m2', pagina: 'pág. 6, módulo A1-A3 GWP-fósil',        archivo: 'EPD_Doble_Acristalamiento.pdf' },
  Herrajes:           { valor: 4.2,  unidad: 'kg_ud', pagina: 'pág. 3, "Carbon footprint per unit"',   archivo: 'DAP_Herraje_Practicable.pdf' },
  'Cajón de persiana':{ valor: 12.0, unidad: 'kg_m',  pagina: 'pág. 4, tabla A1-A3',                   archivo: 'DAP_Perfil_Persiana.pdf' },
};

export default function App() {
  const [step, setStep] = useState(0);

  const [ancho, setAncho] = useState(1.2);
  const [alto, setAlto] = useState(1.5);
  const [hojas, setHojas] = useState(2);
  const [persiana, setPersiana] = useState(true);

  const [perfil,    setPerfil]    = useState({ ...COMPONENTE_DEFAULT('Perfil'),             valor: 8.4,  unidad: 'kg_m',  peso: 0 });
  const [vidrio,    setVidrio]    = useState({ ...COMPONENTE_DEFAULT('Vidrio'),             valor: 25.0, unidad: 'kg_m2' });
  const [herraje,   setHerraje]   = useState({ ...COMPONENTE_DEFAULT('Herrajes'),           valor: 4.2,  unidad: 'kg_ud', cantidad: 1 });
  const [cajonComp, setCajonComp] = useState({ ...COMPONENTE_DEFAULT('Cajón de persiana'), valor: 12.0, unidad: 'kg_m' });

  const [horasM2,   setHorasM2]   = useState(0.6);
  const [distancia, setDistancia] = useState(150);
  const [maderaM2,  setMaderaM2]  = useState(1.4);
  const [filmM2,    setFilmM2]    = useState(0.2);
  const [cartonM2,  setCartonM2]  = useState(0.5);

  const FE = { taller: 1.6, transporte: 0.012, madera: 0.45, film: 2.5, carton: 0.9 };

  const geo = useMemo(() => {
    const area = ancho * alto;
    const perimetroMarco = 2 * (ancho + alto);
    const perimetroHojasExtra = hojas === 2 ? alto * 1.0 : 0;
    const perimetro = perimetroMarco + perimetroHojasExtra;
    const perimetroPersiana = persiana ? ancho * 1.15 : 0;
    return { area, perimetro, perimetroPersiana };
  }, [ancho, alto, hojas, persiana]);

  function aportaCO2(comp, baseLineal) {
    if (!comp.activo) return 0;
    switch (comp.unidad) {
      case 'kg_kg': return comp.valor * comp.peso;
      case 'kg_m':  return comp.valor * baseLineal;
      case 'kg_m2': return comp.valor * geo.area;
      case 'kg_ud': return comp.valor * comp.cantidad;
      default: return 0;
    }
  }

  const calc = useMemo(() => {
    const cPerfil  = aportaCO2(perfil,    geo.perimetro);
    const cVidrio  = aportaCO2(vidrio,    geo.perimetro);
    const cHerraje = aportaCO2(herraje,   geo.perimetro);
    const cCajon   = persiana ? aportaCO2(cajonComp, geo.perimetroPersiana) : 0;

    const a1a3 = cPerfil + cVidrio + cHerraje + cCajon;

    const cEnsamblaje = horasM2 * geo.area * FE.taller;
    const cTransporte = distancia * FE.transporte;
    const cEmbalaje   = (maderaM2 * FE.madera + filmM2 * FE.film + cartonM2 * FE.carton) * geo.area;
    const restoModulos = cEnsamblaje + cTransporte + cEmbalaje;

    const total = a1a3 + restoModulos;

    return {
      cPerfil, cVidrio, cHerraje, cCajon, a1a3,
      cEnsamblaje, cTransporte, cEmbalaje, restoModulos,
      total, porM2: total / geo.area, a1a3PorM2: a1a3 / geo.area,
    };
  }, [perfil, vidrio, herraje, cajonComp, persiana, geo, horasM2, distancia, maderaM2, filmM2, cartonM2]);

  const steps = ['Ventana', 'Componentes', 'Proceso', 'Huella'];

  return (
    <div style={{
      minHeight: '100vh', background: COL.paper, color: COL.ink,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      padding: '0', margin: 0,
    }}>
      <div style={{
        background: COL.white, borderBottom: `1px solid ${COL.line}`,
        padding: '18px 28px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9,
            background: `linear-gradient(135deg, ${COL.cyan}, ${COL.cyanDeep})`,
            display: 'grid', placeItems: 'center', color: '#fff',
            fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px',
          }}>T</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
              Calculadora de Huella de Carbono
            </div>
            <div style={{ fontSize: 12.5, color: COL.mist }}>
              Techne Soluciones · Ventanas y cerramientos · EN 17213 / EN 15804
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: COL.cyanDeep, background: '#E8F6FB',
          padding: '5px 11px', borderRadius: 20, fontWeight: 600,
          border: `1px solid ${COL.glass}`,
        }}>DEMO CONCEPTUAL v2</div>
      </div>

      <div style={{
        display: 'flex', gap: 0, padding: '0 28px', background: COL.white,
        borderBottom: `1px solid ${COL.line}`, overflowX: 'auto',
      }}>
        {steps.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            padding: '14px 18px', fontSize: 13.5, fontWeight: step === i ? 700 : 500,
            color: step === i ? COL.cyanDeep : COL.mist,
            borderBottom: step === i ? `2.5px solid ${COL.cyan}` : '2.5px solid transparent',
            display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', fontSize: 11,
              display: 'grid', placeItems: 'center', fontWeight: 700,
              background: step >= i ? COL.cyan : COL.line,
              color: step >= i ? '#fff' : COL.mist,
            }}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 60px' }}>

        {step === 0 && (
          <Card>
            <H>Define tu ventana</H>
            <Sub>Configura el producto que quieres declarar. La geometría real afecta directamente a la cantidad de cada componente.</Sub>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 22, alignItems: 'flex-start' }}>
              <WindowSVG ancho={ancho} alto={alto} hojas={hojas} persiana={persiana} />
              <div style={{ flex: 1, minWidth: 260 }}>
                <Slider label="Ancho" value={ancho} min={0.5} max={2.5} step={0.1} unit="m" onChange={setAncho} />
                <Slider label="Alto"  value={alto}  min={0.5} max={2.5} step={0.1} unit="m" onChange={setAlto} />

                <div style={subLabel}>Configuración</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  {[1, 2].map(n => (
                    <Toggle key={n} active={hojas === n} onClick={() => setHojas(n)}>
                      {n} hoja{n > 1 ? 's' : ''}
                    </Toggle>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Toggle active={persiana} onClick={() => setPersiana(!persiana)}>
                    {persiana ? '✓ ' : ''}Con cajón de persiana
                  </Toggle>
                </div>

                <div style={{
                  marginTop: 18, padding: '12px 14px', background: COL.paper,
                  borderRadius: 10, fontSize: 13, color: COL.slate, lineHeight: 1.7,
                }}>
                  <Row k="Superficie de vidrio"                  v={`${fmt(geo.area)} m²`} />
                  <Row k="Perímetro de perfil (marco + hojas)"   v={`${fmt(geo.perimetro)} m`} />
                  {persiana && <Row k="Perímetro de cajón de persiana" v={`${fmt(geo.perimetroPersiana)} m`} />}
                </div>
              </div>
            </div>
            <Next onClick={() => setStep(1)} />
          </Card>
        )}

        {step === 1 && (
          <Card>
            <H>Introduce los datos de tus proveedores</H>
            <Sub>
              Sube el PDF de la DAP de cada proveedor y la herramienta extrae el valor automáticamente
              con IA — o introdúcelo a mano si lo prefieres. Cada proveedor declara su huella en una
              unidad distinta; la herramienta hace la conversión por ti.
            </Sub>

            <ComponentRow comp={perfil}    setComp={setPerfil}    hint="Ej: ITESAL declara en kg CO₂/kg de perfil" />
            <ComponentRow comp={vidrio}    setComp={setVidrio}    hint="Ej: algunos vidrios declaran en kg CO₂/m² de ventana" />
            <ComponentRow comp={herraje}   setComp={setHerraje}   hint="Habitualmente en kg CO₂/kg o por unidad" />
            {persiana && (
              <ComponentRow comp={cajonComp} setComp={setCajonComp} hint="Perfil del cajón — normalmente en kg CO₂/m lineal" />
            )}

            <div style={{
              marginTop: 14, fontSize: 12, color: COL.mist, fontStyle: 'italic',
              display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.6,
            }}>
              <Dot c={COL.leaf} />
              <span>
                La extracción por IA es asistida, no automática: siempre puedes revisar y corregir el
                valor antes de que entre en el cálculo. El dato final es responsabilidad tuya.
              </span>
            </div>
            <Next onClick={() => setStep(2)} />
          </Card>
        )}

        {step === 2 && (
          <Card>
            <H>Añade tu impacto de fabricación</H>
            <Sub>
              Introduce tus datos por <b>m² de ventana</b> — así puedes reutilizar los mismos valores
              de referencia para cualquier tamaño de ventana que fabriques.
            </Sub>

            <div style={{ marginTop: 20 }}>
              <div style={subLabel}>Ensamblaje</div>
              <Slider label="Horas de taller por m² de ventana" value={horasM2} min={0} max={3} step={0.05} unit="h/m²" onChange={setHorasM2} />
              <div style={miniNote}>→ {fmt(horasM2 * geo.area)} h totales para esta ventana ({fmt(geo.area)} m²)</div>

              <div style={subLabel}>Transporte de componentes a tu taller</div>
              <Slider label="Distancia media desde proveedores" value={distancia} min={0} max={600} step={10} unit="km" onChange={setDistancia} />

              <div style={subLabel}>Embalaje por m² de ventana</div>
              <Slider label="Madera (palet, protección)" value={maderaM2} min={0} max={5}  step={0.1}  unit="kg/m²" onChange={setMaderaM2} />
              <Slider label="Film plástico"              value={filmM2}   min={0} max={1}  step={0.05} unit="kg/m²" onChange={setFilmM2} />
              <Slider label="Cartón"                     value={cartonM2} min={0} max={2}  step={0.1}  unit="kg/m²" onChange={setCartonM2} />
            </div>

            <div style={{
              marginTop: 18, padding: '14px 16px', background: '#FBF4E9',
              borderRadius: 10, fontSize: 13, color: COL.slate,
              border: `1px solid #F0E0C4`, lineHeight: 1.7,
            }}>
              <Row k="Ensamblaje (para esta ventana)"  v={`${fmt(calc.cEnsamblaje)} kg CO₂`} />
              <Row k="Transporte de componentes"        v={`${fmt(calc.cTransporte)} kg CO₂`} />
              <Row k="Embalaje (para esta ventana)"     v={`${fmt(calc.cEmbalaje)} kg CO₂`} />
              <div style={{ borderTop: `1px solid #F0E0C4`, margin: '6px 0' }} />
              <Row k="Tu proceso aporta" v={`${fmt(calc.restoModulos)} kg CO₂ eq`} bold />
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: COL.mist, fontStyle: 'italic', lineHeight: 1.6 }}>
              El embalaje conecta con tus obligaciones bajo la Ley 7/2022 de residuos de envases.
            </div>
            <Next onClick={() => setStep(3)} label="Calcular huella" />
          </Card>
        )}

        {step === 3 && (
          <Card>
            <H>Huella de carbono de tu ventana</H>
            <Sub>Resultado separado por fases del ciclo de vida, conforme a EN 15804.</Sub>

            <div style={{
              marginTop: 22, border: `1.5px solid ${COL.cyan}`, borderRadius: 16,
              overflow: 'hidden',
            }}>
              <div style={{
                background: `linear-gradient(150deg, ${COL.ink}, ${COL.cyanDeep})`,
                padding: '20px 22px', color: '#fff',
              }}>
                <div style={{
                  fontSize: 11.5, opacity: 0.85, letterSpacing: 1, textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  Módulos A1–A3 · Fase de producto
                  <span style={{
                    fontSize: 10, background: 'rgba(255,255,255,0.18)', padding: '2px 8px',
                    borderRadius: 10, fontWeight: 700, textTransform: 'none', letterSpacing: 0,
                  }}>Lo que exige el DB-HSA</span>
                </div>
                <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.1, margin: '6px 0' }}>
                  {fmt(calc.a1a3)}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>
                  kg CO₂ eq · {fmt(calc.a1a3PorM2)} kg CO₂ eq/m²
                </div>
              </div>
              <div style={{ padding: '16px 20px', background: COL.white }}>
                <Row k="Perfil"   v={`${fmt(calc.cPerfil)} kg CO₂`} />
                <Row k="Vidrio"   v={`${fmt(calc.cVidrio)} kg CO₂`} />
                <Row k="Herrajes" v={`${fmt(calc.cHerraje)} kg CO₂`} />
                {persiana && <Row k="Cajón de persiana" v={`${fmt(calc.cCajon)} kg CO₂`} />}
              </div>
            </div>

            <div style={{
              marginTop: 18, border: `1px solid ${COL.line}`, borderRadius: 14,
              padding: '16px 18px', background: COL.paper,
            }}>
              <div style={{
                fontSize: 11.5, color: COL.mist, letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 8, fontWeight: 700,
              }}>
                Resto de módulos · Proceso del fabricante
              </div>
              <Row k="Ensamblaje"                v={`${fmt(calc.cEnsamblaje)} kg CO₂`} />
              <Row k="Transporte de componentes" v={`${fmt(calc.cTransporte)} kg CO₂`} />
              <Row k="Embalaje"                  v={`${fmt(calc.cEmbalaje)} kg CO₂`} />
              <div style={{ borderTop: `1px solid ${COL.line}`, margin: '6px 0' }} />
              <Row k="Subtotal proceso" v={`${fmt(calc.restoModulos)} kg CO₂ eq`} bold />
            </div>

            <div style={{
              marginTop: 18, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '14px 18px', background: COL.ink,
              borderRadius: 12, color: '#fff', flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Total agregado (todos los módulos)</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmt(calc.total)} kg CO₂ eq</span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
              <button style={btnPrimary} onClick={() => alert('En la versión final: informe PDF trazable con desglose A1-A3 y resto de módulos, listo para apoyar la declaración ambiental conforme al DB-HSA.')}>
                Generar informe ↓
              </button>
              <button style={btnGhost} onClick={() => setStep(0)}>
                Nueva ventana
              </button>
            </div>

            <div style={{
              marginTop: 20, fontSize: 11.5, color: COL.mist, fontStyle: 'italic',
              lineHeight: 1.6, borderTop: `1px solid ${COL.line}`, paddingTop: 14,
            }}>
              Demo conceptual con cálculo simplificado y datos de ejemplo editables. La versión final
              implementa la verificación completa conforme a EN 17213 y EN 15804, homogeneizando
              unidades de origen de cualquier proveedor y separando los módulos A1-A3 del resto,
              conforme al documento de apoyo del DB-HSA.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div style={{
    background: COL.white, borderRadius: 18, padding: '28px 26px',
    boxShadow: '0 1px 3px rgba(20,32,46,0.06), 0 8px 30px rgba(20,32,46,0.05)',
    border: `1px solid ${COL.line}`,
  }}>{children}</div>;
}
function H({ children }) {
  return <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.4px' }}>{children}</div>;
}
function Sub({ children }) {
  return <div style={{ fontSize: 14, color: COL.mist, marginTop: 6, lineHeight: 1.6 }}>{children}</div>;
}
function Row({ k, v, bold }) {
  return <div style={{
    display: 'flex', justifyContent: 'space-between', padding: '3px 0',
    fontWeight: bold ? 700 : 400, color: bold ? COL.ink : COL.slate,
  }}><span>{k}</span><span>{v}</span></div>;
}
function Dot({ c }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block', marginTop: 5, flexShrink: 0 }} />;
}
function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
        <span style={{ color: COL.slate, fontWeight: 500 }}>{label}</span>
        <span style={{ color: COL.cyanDeep, fontWeight: 700 }}>{fmt(value)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: COL.cyan, height: 4 }} />
    </div>
  );
}
function Toggle({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, cursor: 'pointer', padding: '10px 14px', borderRadius: 10,
      border: active ? `1.5px solid ${COL.cyan}` : `1px solid ${COL.line}`,
      background: active ? '#F0FAFE' : COL.white,
      color: active ? COL.cyanDeep : COL.slate,
      fontWeight: 600, fontSize: 13,
    }}>{children}</button>
  );
}
function NumberInput({ value, onChange, w = 90, suffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" value={value} step="0.1"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{
          width: w, padding: '8px 10px', borderRadius: 8, border: `1px solid ${COL.line}`,
          fontSize: 13.5, color: COL.ink, fontWeight: 600,
        }} />
      {suffix && <span style={{ fontSize: 12, color: COL.mist }}>{suffix}</span>}
    </div>
  );
}
function ComponentRow({ comp, setComp, hint }) {
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    const sim = EXTRACCION_SIMULADA[comp.nombre];
    const archivoNombre = file ? file.name : sim.archivo;

    setComp({ ...comp, leyendo: true, archivoNombre });

    // Simula el tiempo de lectura del PDF por la IA
    setTimeout(() => {
      setComp((prev) => ({
        ...prev,
        leyendo: false,
        origen: 'pdf',
        valor: sim.valor,
        unidad: sim.unidad,
        archivoNombre,
        pagina: sim.pagina,
      }));
    }, 1100);
  };

  return (
    <div style={{
      marginTop: 16, border: comp.origen === 'pdf' ? `1.5px solid ${COL.leaf}` : `1px solid ${COL.line}`,
      borderRadius: 12, padding: '14px 16px',
      background: comp.activo ? COL.white : COL.paper,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: COL.ink }}>{comp.nombre}</span>
        <span style={{ fontSize: 11, color: COL.mist, fontStyle: 'italic' }}>{hint}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <label style={{
          ...uploadBtn,
          background: comp.origen === 'pdf' ? '#EAF7EF' : COL.white,
          borderColor: comp.origen === 'pdf' ? COL.leaf : COL.line,
          color: comp.origen === 'pdf' ? COL.leaf : COL.slate,
        }}>
          <input type="file" accept="application/pdf" onChange={handleUpload} style={{ display: 'none' }} />
          📄 Subir DAP (PDF)
        </label>
        <button
          onClick={() => setComp({ ...comp, origen: 'manual' })}
          style={{
            ...uploadBtn,
            background: comp.origen === 'manual' ? '#F0FAFE' : COL.white,
            borderColor: comp.origen === 'manual' ? COL.cyan : COL.line,
            color: comp.origen === 'manual' ? COL.cyanDeep : COL.slate,
            cursor: 'pointer',
          }}
        >
          ✏ Introducir manualmente
        </button>
      </div>

      {comp.leyendo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: '#FBF4E9', borderRadius: 8, fontSize: 12.5, color: COL.slate,
          marginBottom: 12, border: '1px solid #F0E0C4',
        }}>
          <Spinner /> Leyendo {comp.archivoNombre} con IA…
        </div>
      )}

      {comp.origen === 'pdf' && !comp.leyendo && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
          background: '#EAF7EF', borderRadius: 8, fontSize: 12, color: COL.leaf,
          marginBottom: 12, border: '1px solid #CFEBD9', lineHeight: 1.5,
        }}>
          <span>✓</span>
          <span>
            Extraído de <b>{comp.archivoNombre}</b> — {comp.pagina}. Revisa el valor antes de continuar.
          </span>
        </div>
      )}

      {(comp.origen === 'manual' || comp.origen === 'pdf') && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11.5, color: COL.mist, marginBottom: 4 }}>Valor de la DAP</div>
            <NumberInput value={comp.valor} onChange={(v) => setComp({ ...comp, valor: v, origen: comp.origen === 'pdf' ? 'pdf' : 'manual' })} suffix="kg CO₂" />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: COL.mist, marginBottom: 4 }}>Unidad de origen</div>
            <select value={comp.unidad} onChange={(e) => setComp({ ...comp, unidad: e.target.value })}
              style={{
                padding: '8px 10px', borderRadius: 8, border: `1px solid ${COL.line}`,
                fontSize: 13, color: COL.ink, background: COL.white, fontWeight: 600,
              }}>
              {UNIDADES_COMPONENTE.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          {comp.unidad === 'kg_kg' && (
            <div>
              <div style={{ fontSize: 11.5, color: COL.mist, marginBottom: 4 }}>Peso del componente</div>
              <NumberInput value={comp.peso} onChange={(v) => setComp({ ...comp, peso: v })} suffix="kg" />
            </div>
          )}
          {comp.unidad === 'kg_ud' && (
            <div>
              <div style={{ fontSize: 11.5, color: COL.mist, marginBottom: 4 }}>Cantidad</div>
              <NumberInput value={comp.cantidad} onChange={(v) => setComp({ ...comp, cantidad: v })} suffix="ud" w={70} />
            </div>
          )}
        </div>
      )}

      {!comp.origen && !comp.leyendo && (
        <div style={{ fontSize: 12, color: COL.mist, fontStyle: 'italic' }}>
          Elige cómo quieres introducir el dato de este componente.
        </div>
      )}
    </div>
  );
}
function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
      border: `2px solid ${COL.amber}`, borderTopColor: 'transparent',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
function WindowSVG({ ancho, alto, hojas, persiana }) {
  const w = 130, scale = w / 2.5;
  const ww = Math.max(40, ancho * scale);
  const hh = Math.max(40, alto * scale);
  const persianaH = persiana ? 14 : 0;
  return (
    <svg width={ww + 30} height={hh + 30 + persianaH} style={{ flexShrink: 0 }}>
      {persiana && (
        <rect x="6" y="4" width={ww} height={persianaH} rx="2"
          fill={COL.mist} stroke={COL.ink} strokeWidth="1.5" />
      )}
      <rect x="6" y={6 + persianaH} width={ww} height={hh} rx="4"
        fill={COL.glass} stroke={COL.cyanDeep} strokeWidth="5" opacity="0.92" />
      {hojas === 2 && (
        <line x1={6 + ww / 2} y1={6 + persianaH} x2={6 + ww / 2} y2={6 + persianaH + hh} stroke={COL.cyanDeep} strokeWidth="4" />
      )}
      <line x1="6" y1={6 + persianaH + hh / 2} x2={6 + ww} y2={6 + persianaH + hh / 2} stroke={COL.cyanDeep} strokeWidth="3" />
      <line x1="14" y1={14 + persianaH} x2={ww - 6} y2={persianaH + hh - 6} stroke="#fff" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
function Next({ onClick, label = 'Continuar →' }) {
  return (
    <div style={{ marginTop: 26, display: 'flex', justifyContent: 'flex-end' }}>
      <button style={btnPrimary} onClick={onClick}>{label}</button>
    </div>
  );
}
const btnPrimary = {
  background: COL.cyan, color: '#fff', border: 'none', cursor: 'pointer',
  padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
  boxShadow: '0 2px 8px rgba(26,159,212,0.3)',
};
const btnGhost = {
  background: 'none', color: COL.slate, border: `1px solid ${COL.line}`,
  cursor: 'pointer', padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 600,
};
const subLabel = {
  fontSize: 13, fontWeight: 700, color: COL.ink, marginTop: 18, marginBottom: 10,
  paddingBottom: 6, borderBottom: `1px solid ${COL.line}`,
};
const miniNote = {
  fontSize: 11.5, color: COL.mist, marginTop: -10, marginBottom: 16, fontStyle: 'italic',
};
const uploadBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  padding: '8px 14px', borderRadius: 9, border: `1px solid ${COL.line}`,
  fontSize: 12.5, fontWeight: 600, transition: 'all .15s',
};
