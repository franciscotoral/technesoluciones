import React, { useState, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────
// TECHNE · Calculadora de Huella de Carbono para Ventanas
// Demo conceptual — datos de ejemplo basados en DAP públicas
// ─────────────────────────────────────────────────────────────

const COL = {
  ink: '#14202E',
  slate: '#3A4A5C',
  mist: '#6B7B8C',
  line: '#D8E0E6',
  paper: '#F4F7F9',
  white: '#FFFFFF',
  cyan: '#1A9FD4',
  cyanDeep: '#0E7BA8',
  leaf: '#2E9E6B',
  amber: '#E0922F',
  glass: '#BFE3EE',
};

// Componentes con DAP pública (valores A1-A3 reales aproximados, kg CO2 eq)
const PERFILES = [
  { id: 'alu-itesal', label: 'Perfil aluminio RPT', marca: 'ITESAL', unidad: 'kg CO₂/m', gwp: 8.4, fuente: 'DAP GlobalEPD' },
  { id: 'pvc-komm', label: 'Perfil PVC 6 cámaras', marca: 'Kömmerling 76', unidad: 'kg CO₂/m', gwp: 3.1, fuente: 'DAP IBU' },
  { id: 'alu-recycled', label: 'Perfil aluminio reciclado', marca: 'Genérico', unidad: 'kg CO₂/m', gwp: 3.9, fuente: 'INIES' },
];

const VIDRIOS = [
  { id: 'sgg-orae', label: 'Vidrio bajo carbono ORAÉ', marca: 'Saint-Gobain', unidad: 'kg CO₂/m²', gwp: 6.64, fuente: 'EPD verificada' },
  { id: 'sgg-std', label: 'Doble acristalamiento estándar', marca: 'Genérico', unidad: 'kg CO₂/m²', gwp: 25.0, fuente: 'ÖKOBAUDAT' },
  { id: 'triple', label: 'Triple acristalamiento', marca: 'Genérico', unidad: 'kg CO₂/m²', gwp: 38.0, fuente: 'ÖKOBAUDAT' },
];

const HERRAJES = [
  { id: 'herr-std', label: 'Herraje practicable estándar', marca: 'Genérico', unidad: 'kg CO₂/ud', gwp: 4.2, fuente: 'INIES' },
  { id: 'herr-osc', label: 'Herraje oscilobatiente', marca: 'Genérico', unidad: 'kg CO₂/ud', gwp: 6.1, fuente: 'INIES' },
];

const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function App() {
  const [step, setStep] = useState(0);
  const [ancho, setAncho] = useState(1.2);
  const [alto, setAlto] = useState(1.5);
  const [perfil, setPerfil] = useState(PERFILES[0]);
  const [vidrio, setVidrio] = useState(VIDRIOS[0]);
  const [herraje, setHerraje] = useState(HERRAJES[0]);
  const [energia, setEnergia] = useState(2.5);   // kg CO2 por ventana (taller)
  const [transporte, setTransporte] = useState(1.8);
  const [embalaje, setEmbalaje] = useState(0.9);

  // ── Cálculo simplificado (demostrativo, módulos A1-A3 + A4-A5) ──
  const calc = useMemo(() => {
    const perimetro = 2 * (ancho + alto);          // m de perfil
    const area = ancho * alto;                       // m² de vidrio
    const cPerfil = perimetro * perfil.gwp;
    const cVidrio = area * vidrio.gwp;
    const cHerraje = herraje.gwp;
    const cComponentes = cPerfil + cVidrio + cHerraje;
    const cProceso = energia + transporte + embalaje;
    const total = cComponentes + cProceso;
    return {
      perimetro, area, cPerfil, cVidrio, cHerraje,
      cComponentes, cProceso, total,
      porM2: total / area,
    };
  }, [ancho, alto, perfil, vidrio, herraje, energia, transporte, embalaje]);

  const steps = ['Ventana', 'Componentes', 'Proceso', 'Huella'];

  return (
    <div style={{
      minHeight: '100vh', background: COL.paper, color: COL.ink,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      padding: '0', margin: 0,
    }}>
      {/* HEADER */}
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
        }}>DEMO CONCEPTUAL</div>
      </div>

      {/* STEP NAV */}
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

      {/* BODY */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* STEP 0 — VENTANA */}
        {step === 0 && (
          <Card>
            <H>Define tu ventana</H>
            <Sub>Configura el producto que quieres declarar. La huella se calcula sobre esta unidad.</Sub>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 22, alignItems: 'center' }}>
              <WindowSVG ancho={ancho} alto={alto} />
              <div style={{ flex: 1, minWidth: 230 }}>
                <Slider label="Ancho" value={ancho} min={0.5} max={2.5} step={0.1} unit="m" onChange={setAncho} />
                <Slider label="Alto" value={alto} min={0.5} max={2.5} step={0.1} unit="m" onChange={setAlto} />
                <div style={{
                  marginTop: 18, padding: '12px 14px', background: COL.paper,
                  borderRadius: 10, fontSize: 13, color: COL.slate, lineHeight: 1.7,
                }}>
                  <Row k="Superficie de vidrio" v={`${fmt(calc.area)} m²`} />
                  <Row k="Perímetro de perfil" v={`${fmt(calc.perimetro)} m`} />
                </div>
              </div>
            </div>
            <Next onClick={() => setStep(1)} />
          </Card>
        )}

        {/* STEP 1 — COMPONENTES */}
        {step === 1 && (
          <Card>
            <H>Selecciona los componentes</H>
            <Sub>Elige los productos de tus proveedores. Cada uno aporta su huella desde su DAP verificada.</Sub>

            <Picker title="Perfil" options={PERFILES} value={perfil} onSelect={setPerfil} />
            <Picker title="Vidrio" options={VIDRIOS} value={vidrio} onSelect={setVidrio} />
            <Picker title="Herraje" options={HERRAJES} value={herraje} onSelect={setHerraje} />

            <div style={{
              marginTop: 8, fontSize: 12, color: COL.mist, fontStyle: 'italic',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Dot c={COL.leaf} /> Datos de ejemplo basados en DAP públicas (ITESAL, Saint-Gobain, Kömmerling, INIES, ÖKOBAUDAT)
            </div>
            <Next onClick={() => setStep(2)} />
          </Card>
        )}

        {/* STEP 2 — PROCESO */}
        {step === 2 && (
          <Card>
            <H>Añade tu impacto de fabricación</H>
            <Sub>Lo que aportas tú como fabricante de la ventana: ensamblaje, transporte y embalaje. Por unidad de producto.</Sub>
            <div style={{ marginTop: 20 }}>
              <Slider label="Energía de taller (corte, ensamblaje)" value={energia} min={0} max={10} step={0.1} unit="kg CO₂" onChange={setEnergia} />
              <Slider label="Transporte de componentes" value={transporte} min={0} max={10} step={0.1} unit="kg CO₂" onChange={setTransporte} />
              <Slider label="Embalaje final" value={embalaje} min={0} max={5} step={0.1} unit="kg CO₂" onChange={setEmbalaje} />
            </div>
            <div style={{
              marginTop: 18, padding: '12px 14px', background: '#FBF4E9',
              borderRadius: 10, fontSize: 13, color: COL.slate,
              border: `1px solid #F0E0C4`,
            }}>
              Tu proceso aporta <b>{fmt(calc.cProceso)} kg CO₂ eq</b> a la huella total.
            </div>
            <Next onClick={() => setStep(3)} label="Calcular huella" />
          </Card>
        )}

        {/* STEP 3 — RESULTADO */}
        {step === 3 && (
          <Card>
            <H>Huella de carbono de tu ventana</H>
            <Sub>Resultado conforme a los módulos A1–A5 de EN 15804, agregados según EN 17213.</Sub>

            <div style={{
              display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 22,
              alignItems: 'stretch',
            }}>
              {/* Big number */}
              <div style={{
                flex: '1 1 230px', background: `linear-gradient(150deg, ${COL.ink}, ${COL.cyanDeep})`,
                borderRadius: 16, padding: '26px 24px', color: '#fff',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 12.5, opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' }}>
                  PCG / GWP total
                </div>
                <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.05, margin: '6px 0' }}>
                  {fmt(calc.total)}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>kg CO₂ eq · por ventana</div>
                <div style={{
                  marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)',
                  fontSize: 13.5, opacity: 0.92,
                }}>
                  {fmt(calc.porM2)} kg CO₂ eq / m²
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ flex: '1 1 300px' }}>
                <BreakBar label="Perfil" v={calc.cPerfil} total={calc.total} c={COL.cyan} />
                <BreakBar label="Vidrio" v={calc.cVidrio} total={calc.total} c={COL.cyanDeep} />
                <BreakBar label="Herraje" v={calc.cHerraje} total={calc.total} c={COL.glass} />
                <BreakBar label="Tu proceso" v={calc.cProceso} total={calc.total} c={COL.amber} />
              </div>
            </div>

            <div style={{
              marginTop: 22, padding: '16px 18px', background: COL.paper,
              borderRadius: 12, fontSize: 13, color: COL.slate, lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 700, color: COL.ink, marginBottom: 8 }}>Desglose del cálculo</div>
              <Row k={`Perfil · ${perfil.marca} (${fmt(calc.perimetro)} m)`} v={`${fmt(calc.cPerfil)} kg CO₂`} />
              <Row k={`Vidrio · ${vidrio.marca} (${fmt(calc.area)} m²)`} v={`${fmt(calc.cVidrio)} kg CO₂`} />
              <Row k={`Herraje · ${herraje.label}`} v={`${fmt(calc.cHerraje)} kg CO₂`} />
              <Row k="Proceso de fabricación propio" v={`${fmt(calc.cProceso)} kg CO₂`} />
              <div style={{ borderTop: `1px solid ${COL.line}`, margin: '8px 0' }} />
              <Row k="Total declarado" v={`${fmt(calc.total)} kg CO₂ eq`} bold />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
              <button style={btnPrimary} onClick={() => alert('En la versión final: genera un informe PDF trazable y verificable, listo para la declaración ambiental del producto.')}>
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
              Demo conceptual con cálculo simplificado y datos de ejemplo. La versión final implementa
              el conjunto completo de módulos del ciclo de vida (A, B, C, D) y la verificación conforme
              a EN 17213 y EN 15804, con conexión a las bases de datos de DAP reconocidas por ECO Platform.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────
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
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />;
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
function Picker({ title, options, value, onSelect }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COL.ink, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const sel = value.id === o.id;
          return (
            <button key={o.id} onClick={() => onSelect(o)} style={{
              flex: '1 1 200px', textAlign: 'left', cursor: 'pointer',
              border: sel ? `1.5px solid ${COL.cyan}` : `1px solid ${COL.line}`,
              background: sel ? '#F0FAFE' : COL.white,
              borderRadius: 12, padding: '12px 14px', transition: 'all .15s',
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COL.ink }}>{o.label}</div>
              <div style={{ fontSize: 12, color: COL.mist, marginTop: 2 }}>{o.marca}</div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginTop: 8,
                fontSize: 12, alignItems: 'center',
              }}>
                <span style={{ color: COL.cyanDeep, fontWeight: 700 }}>{fmt(o.gwp)} {o.unidad}</span>
                <span style={{ color: COL.leaf, fontSize: 11 }}>{o.fuente}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function BreakBar({ label, v, total, c }) {
  const pct = total > 0 ? (v / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
        <span style={{ color: COL.slate, fontWeight: 600 }}>{label}</span>
        <span style={{ color: COL.mist }}>{fmt(v)} kg · {pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 9, background: COL.paper, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 5, transition: 'width .4s' }} />
      </div>
    </div>
  );
}
function WindowSVG({ ancho, alto }) {
  const w = 130, scale = w / 2.5;
  const ww = Math.max(40, ancho * scale);
  const hh = Math.max(40, alto * scale);
  return (
    <svg width={ww + 30} height={hh + 30} style={{ flexShrink: 0 }}>
      <rect x="6" y="6" width={ww} height={hh} rx="4"
        fill={COL.glass} stroke={COL.cyanDeep} strokeWidth="5" opacity="0.92" />
      <line x1={6 + ww / 2} y1="6" x2={6 + ww / 2} y2={6 + hh} stroke={COL.cyanDeep} strokeWidth="3" />
      <line x1="6" y1={6 + hh / 2} x2={6 + ww} y2={6 + hh / 2} stroke={COL.cyanDeep} strokeWidth="3" />
      <line x1="14" y1="14" x2={ww - 6} y2={hh - 6} stroke="#fff" strokeWidth="1.5" opacity="0.5" />
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
