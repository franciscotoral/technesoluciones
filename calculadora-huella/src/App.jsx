import React, { useMemo, useState } from 'react';

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

const FE = {
  taller: 1.575, transporte: 0.012, madera: 0.45, film: 2.5, carton: 0.9,
};

const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TECHNE_SESSION_KEY = 'techne_auth_session';

function leerSesionTechne() {
  try {
    const raw = localStorage.getItem(TECHNE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.expiresAt || parsed.expiresAt <= Date.now() + 10000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

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

function validarDimensionComponente(comp) {
  if (!comp.activo) return '';
  if (comp.unidad === 'kg_kg' && !(comp.peso > 0)) {
    return `Indica un peso mayor que 0 kg para ${comp.nombre}.`;
  }
  if (comp.unidad === 'kg_ud' && !(comp.cantidad > 0)) {
    return `Indica una cantidad mayor que 0 para ${comp.nombre}.`;
  }
  return '';
}

export default function App() {
  const [step, setStep] = useState(0);
  const [session, setSession] = useState(() => leerSesionTechne());
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaCif, setEmpresaCif] = useState('');
  const [productoNombre, setProductoNombre] = useState('Ventana personalizada');

  const [ancho, setAncho] = useState(1.2);
  const [alto, setAlto] = useState(1.5);
  const [hojas, setHojas] = useState(2);
  const [persiana, setPersiana] = useState(true);

  const [perfil,    setPerfil]    = useState({ ...COMPONENTE_DEFAULT('Perfil'),             valor: 8.4,  unidad: 'kg_m',  peso: 0 });
  const [vidrio,    setVidrio]    = useState({ ...COMPONENTE_DEFAULT('Vidrio'),             valor: 25.0, unidad: 'kg_m2' });
  const [herraje,   setHerraje]   = useState({ ...COMPONENTE_DEFAULT('Herrajes'),           valor: 4.2,  unidad: 'kg_ud', cantidad: 1 });
  const [cajonComp, setCajonComp] = useState({ ...COMPONENTE_DEFAULT('Cajón de persiana'), valor: 12.0, unidad: 'kg_m' });
  const [resultadoApi, setResultadoApi] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [errorCalculo, setErrorCalculo] = useState('');
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [errorInforme, setErrorInforme] = useState('');

  const [horasM2,   setHorasM2]   = useState(0.6);
  const [distancia, setDistancia] = useState(150);
  const [maderaM2,  setMaderaM2]  = useState(1.4);
  const [filmM2,    setFilmM2]    = useState(0.2);
  const [cartonM2,  setCartonM2]  = useState(0.5);

  const authHeaders = useMemo(() => (
    session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}
  ), [session?.accessToken]);

  const geo = useMemo(() => {
    const area = ancho * alto;
    const perimetroMarco = 2 * (ancho + alto);
    const perimetroHojasExtra = hojas === 2 ? alto * 1.0 : 0;
    const perimetro = perimetroMarco + perimetroHojasExtra;
    const perimetroPersiana = persiana ? ancho * 1.15 : 0;
    return { area, perimetro, perimetroPersiana };
  }, [ancho, alto, hojas, persiana]);

  const calc = useMemo(() => {
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
  const componentesPaso = persiana
    ? [perfil, vidrio, herraje, cajonComp]
    : [perfil, vidrio, herraje];
  const erroresComponentes = componentesPaso
    .map(validarDimensionComponente)
    .filter(Boolean);
  const componentesValidos = erroresComponentes.length === 0;

  function crearPayloadCalculo() {
    const definiciones = [
      [perfil, 'perfil'],
      [vidrio, 'vidrio'],
      [herraje, 'herraje'],
      ...(persiana ? [[cajonComp, 'cajon_persiana']] : []),
    ];
    return {
      ancho_m: ancho,
      alto_m: alto,
      hojas,
      cajon_persiana: persiana,
      componentes: definiciones
        .filter(([comp]) => comp.activo)
        .map(([comp, tipo]) => ({
          nombre: comp.nombre,
          tipo,
          gwp_valor: comp.valor,
          gwp_unidad: comp.unidad,
          peso_kg: comp.unidad === 'kg_kg' ? comp.peso : null,
          cantidad: comp.unidad === 'kg_ud' ? comp.cantidad : null,
        })),
      proceso: {
        horas_taller_m2: horasM2,
        distancia_km: distancia,
        madera_kg_m2: maderaM2,
        film_kg_m2: filmM2,
        carton_kg_m2: cartonM2,
      },
    };
  }

  async function calcularHuella() {
    if (!componentesValidos || calculando) return;
    setCalculando(true);
    setErrorCalculo('');
    try {
      const response = await fetch('/api/hcc/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(crearPayloadCalculo()),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo calcular la huella');
      }
      setResultadoApi(data);
      setStep(3);
    } catch (error) {
      setErrorCalculo(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setCalculando(false);
    }
  }

  async function descargarInforme() {
    if (!resultadoApi || generandoInforme) return;
    if (!empresaNombre.trim() || !empresaCif.trim() || !productoNombre.trim()) {
      setErrorInforme(
        'Completa empresa, CIF y nombre del producto en el paso Ventana.'
      );
      return;
    }
    setGenerandoInforme(true);
    setErrorInforme('');
    try {
      const fuentes = componentesPaso.map((comp) => ({
        nombre: comp.nombre,
        proveedor: comp.proveedorExtraido || null,
        programa: comp.programaExtraido || null,
      }));
      const response = await fetch('/api/hcc/informe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          calculo: crearPayloadCalculo(),
          empresa: {
            nombre: empresaNombre.trim(),
            cif: empresaCif.trim(),
          },
          producto_nombre: productoNombre.trim(),
          fuentes,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'No se pudo generar el informe');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const nombre = match?.[1] || 'informe-huella-carbono.pdf';
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorInforme(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setGenerandoInforme(false);
    }
  }

  function irAPaso(destino) {
    if (destino > 1 && !componentesValidos) {
      setStep(1);
      return;
    }
    if (destino === 3) {
      calcularHuella();
      return;
    }
    setStep(destino);
  }

  function cerrarSesion() {
    localStorage.removeItem(TECHNE_SESSION_KEY);
    setSession(null);
    setResultadoApi(null);
    setStep(0);
  }

  function irALogin() {
    const redirect = encodeURIComponent('/calculadora/');
    window.location.href = `/login?redirect=${redirect}`;
  }

  const resultadoMostrado = resultadoApi ? {
    cPerfil: resultadoApi.a1a3.desglose.Perfil ?? 0,
    cVidrio: resultadoApi.a1a3.desglose.Vidrio ?? 0,
    cHerraje: resultadoApi.a1a3.desglose.Herrajes ?? 0,
    cCajon: resultadoApi.a1a3.desglose['Cajón de persiana'] ?? 0,
    a1a3: resultadoApi.a1a3.total_kg,
    a1a3PorM2: resultadoApi.a1a3.total_kg_m2,
    cEnsamblaje: resultadoApi.proceso.desglose.ensamblaje,
    cTransporte: resultadoApi.proceso.desglose.transporte_componentes,
    cEmbalaje: resultadoApi.proceso.desglose.embalaje,
    restoModulos: resultadoApi.proceso.total_kg,
    total: resultadoApi.agregado.total_kg,
  } : calc;

  if (!session) {
    return <LoginBridge onLogin={irALogin} />;
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 11, color: COL.cyanDeep, background: '#E8F6FB',
            padding: '5px 11px', borderRadius: 20, fontWeight: 600,
            border: `1px solid ${COL.glass}`,
          }}>DEMO CONCEPTUAL v2</div>
          <div style={{ fontSize: 12, color: COL.mist }}>
            {session.email}
          </div>
          <button style={{ ...btnGhost, padding: '8px 12px', fontSize: 12 }} onClick={cerrarSesion}>
            Salir
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 0, padding: '0 28px', background: COL.white,
        borderBottom: `1px solid ${COL.line}`, overflowX: 'auto',
      }}>
        {steps.map((s, i) => (
          <button key={s} onClick={() => irAPaso(i)} style={{
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
            <div style={subLabel}>Datos identificativos del informe</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <TextInput
                label="Empresa"
                value={empresaNombre}
                onChange={setEmpresaNombre}
                placeholder="Nombre o razón social"
              />
              <TextInput
                label="CIF"
                value={empresaCif}
                onChange={setEmpresaCif}
                placeholder="B12345678"
                w={150}
              />
              <TextInput
                label="Producto"
                value={productoNombre}
                onChange={setProductoNombre}
                placeholder="Nombre comercial de la ventana"
              />
            </div>
            <div style={{ ...miniNote, marginTop: 8, marginBottom: 0 }}>
              Estos datos aparecerán en la cabecera del informe PDF.
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

            <ComponentRow comp={perfil}    setComp={setPerfil}    hint="Ej: ITESAL declara en kg CO₂/kg de perfil" error={validarDimensionComponente(perfil)} authHeaders={authHeaders} />
            <ComponentRow comp={vidrio}    setComp={setVidrio}    hint="Ej: algunos vidrios declaran en kg CO₂/m² de ventana" error={validarDimensionComponente(vidrio)} authHeaders={authHeaders} />
            <ComponentRow comp={herraje}   setComp={setHerraje}   hint="Habitualmente en kg CO₂/kg o por unidad" error={validarDimensionComponente(herraje)} authHeaders={authHeaders} />
            {persiana && (
              <ComponentRow comp={cajonComp} setComp={setCajonComp} hint="Perfil del cajón — normalmente en kg CO₂/m lineal" error={validarDimensionComponente(cajonComp)} authHeaders={authHeaders} />
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
            {!componentesValidos && (
              <div style={{
                marginTop: 16, padding: '10px 12px', borderRadius: 8,
                color: '#A33A3A', background: '#FDEEEE',
                border: '1px solid #F3CACA', fontSize: 12.5,
              }}>
                Completa los datos requeridos antes de continuar.
              </div>
            )}
            <Next onClick={() => irAPaso(2)} disabled={!componentesValidos} />
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
            {errorCalculo && (
              <div style={{
                marginTop: 14, padding: '10px 12px', borderRadius: 8,
                color: '#A33A3A', background: '#FDEEEE',
                border: '1px solid #F3CACA', fontSize: 12.5,
              }}>
                {errorCalculo}
              </div>
            )}
            <Next
              onClick={calcularHuella}
              label={calculando ? 'Calculando…' : 'Calcular huella'}
              disabled={calculando}
            />
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
                  {fmt(resultadoMostrado.a1a3)}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>
                  kg CO₂ eq · {fmt(resultadoMostrado.a1a3PorM2)} kg CO₂ eq/m²
                </div>
              </div>
              <div style={{ padding: '16px 20px', background: COL.white }}>
                <Row k="Perfil"   v={`${fmt(resultadoMostrado.cPerfil)} kg CO₂`} />
                <Row k="Vidrio"   v={`${fmt(resultadoMostrado.cVidrio)} kg CO₂`} />
                <Row k="Herrajes" v={`${fmt(resultadoMostrado.cHerraje)} kg CO₂`} />
                {persiana && <Row k="Cajón de persiana" v={`${fmt(resultadoMostrado.cCajon)} kg CO₂`} />}
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
              <Row k="Ensamblaje"                v={`${fmt(resultadoMostrado.cEnsamblaje)} kg CO₂`} />
              <Row k="Transporte de componentes" v={`${fmt(resultadoMostrado.cTransporte)} kg CO₂`} />
              <Row k="Embalaje"                  v={`${fmt(resultadoMostrado.cEmbalaje)} kg CO₂`} />
              <div style={{ borderTop: `1px solid ${COL.line}`, margin: '6px 0' }} />
              <Row k="Subtotal proceso" v={`${fmt(resultadoMostrado.restoModulos)} kg CO₂ eq`} bold />
            </div>

            <div style={{
              marginTop: 18, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '14px 18px', background: COL.ink,
              borderRadius: 12, color: '#fff', flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Total agregado (todos los módulos)</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmt(resultadoMostrado.total)} kg CO₂ eq</span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
              <button
                style={{
                  ...btnPrimary,
                  opacity: generandoInforme ? 0.55 : 1,
                  cursor: generandoInforme ? 'not-allowed' : 'pointer',
                }}
                onClick={descargarInforme}
                disabled={generandoInforme}
              >
                {generandoInforme ? 'Generando…' : 'Generar informe ↓'}
              </button>
              <button style={btnGhost} onClick={() => {
                setResultadoApi(null);
                setErrorInforme('');
                setStep(0);
              }}>
                Nueva ventana
              </button>
            </div>
            {errorInforme && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                color: '#A33A3A', background: '#FDEEEE',
                border: '1px solid #F3CACA', fontSize: 12.5,
              }}>
                {errorInforme}
              </div>
            )}

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

const LOGIN = {
  navy: '#143D73', navyDeep: '#0E2C54', blue: '#1F5F9F', sky: '#EAF4FA',
  green: '#66A94A', greenSoft: '#EAF5E6', greenText: '#1B6B3A',
  text: '#17233A', muted: '#6E7D92', border: '#DCE5EE', bg: '#F6F9FC', white: '#FFFFFF',
};

function LoginBridge({ onLogin }) {
  return (
    <div className="techne-login-wrap">
      <style>{`
        .techne-login-wrap {
          position: relative; min-height: 100vh; overflow: hidden;
          background: linear-gradient(180deg, ${LOGIN.white} 0%, ${LOGIN.bg} 45%, ${LOGIN.sky} 100%);
          color: ${LOGIN.text};
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 28px 16px 40px;
          box-sizing: border-box;
        }
        .techne-login-texture { position: absolute; inset: 0; width: 100%; height: 420px; z-index: 0; }
        .techne-login-header {
          position: relative; z-index: 1; width: 100%; max-width: 980px;
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 18px; padding: 4px 6px 8px;
        }
        .techne-login-brand { display: flex; align-items: center; gap: 12px; }
        .techne-login-brand-line { width: 3px; align-self: stretch; min-height: 34px; border-radius: 2px; background: ${LOGIN.green}; }
        .techne-login-brand-logo {
          width: 36px; height: 36px; border-radius: 9px; background: ${LOGIN.navy};
          display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 15px; flex-shrink: 0;
        }
        .techne-login-brand-name { font-weight: 750; font-size: 15.5px; letter-spacing: -0.2px; color: ${LOGIN.text}; }
        .techne-login-brand-sub { font-size: 10.5px; font-weight: 700; letter-spacing: 1.4px; color: ${LOGIN.muted}; margin-top: 2px; }
        .techne-login-illustration { width: 220px; max-width: 44vw; height: auto; flex-shrink: 0; }
        .techne-login-card {
          position: relative; z-index: 1; width: calc(100% - 32px); max-width: 680px;
          background: ${LOGIN.white}; border-radius: 28px; border: 1px solid ${LOGIN.border};
          box-shadow: 0 1px 2px rgba(20,32,46,0.04), 0 24px 60px -20px rgba(20,61,115,0.22);
          padding: 28px; box-sizing: border-box; margin-top: 22px;
        }
        .techne-login-card-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .techne-login-card-head-text { min-width: 0; }
        .techne-login-app-icon { position: relative; width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
          background: linear-gradient(135deg, ${LOGIN.navy}, ${LOGIN.navyDeep});
          display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 22px;
        }
        .techne-login-app-icon-leaf {
          position: absolute; right: -5px; bottom: -5px; width: 20px; height: 20px; border-radius: 7px;
          background: ${LOGIN.green}; display: grid; place-items: center; border: 2px solid ${LOGIN.white};
        }
        .techne-login-title { font-size: 20px; font-weight: 750; letter-spacing: -0.3px; margin: 0 0 4px; line-height: 1.25; overflow-wrap: break-word; }
        .techne-login-subtitle { font-size: 13px; color: ${LOGIN.muted}; overflow-wrap: break-word; }
        .techne-login-secure { color: ${LOGIN.greenText}; font-weight: 700; }
        .techne-login-copy { font-size: 14.5px; color: #3A4A5C; line-height: 1.65; margin: 0 0 20px; }
        .techne-login-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 22px; }
        .techne-login-chip {
          display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0;
          padding: 12px 12px; border-radius: 14px; background: ${LOGIN.bg}; border: 1px solid ${LOGIN.border};
        }
        .techne-login-chip-icon {
          width: 28px; height: 28px; border-radius: 9px; background: ${LOGIN.sky};
          display: grid; place-items: center; color: ${LOGIN.blue}; flex-shrink: 0;
        }
        .techne-login-chip-label { font-size: 12.5px; font-weight: 700; color: ${LOGIN.text}; overflow-wrap: break-word; }
        .techne-login-btn {
          width: 100%; height: 56px; border: none; border-radius: 16px; cursor: pointer;
          background: ${LOGIN.navy}; color: #fff; font-size: 15.5px; font-weight: 650;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: 0 10px 24px -8px rgba(20,61,115,0.45);
          transition: background-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .techne-login-btn:active { transform: scale(0.98); }
        @media (hover: hover) {
          .techne-login-btn:hover { background: ${LOGIN.navyDeep}; transform: translateY(-1px); box-shadow: 0 14px 30px -8px rgba(20,61,115,0.5); }
        }
        .techne-login-shield {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 12px; color: ${LOGIN.muted};
        }
        .techne-login-tagline {
          position: relative; z-index: 1; display: flex; align-items: center; gap: 8px;
          margin-top: 22px; font-size: 13px; font-weight: 600; color: ${LOGIN.greenText};
        }
        @media (prefers-reduced-motion: no-preference) {
          .techne-login-dot { animation: techne-login-pulse 4.5s ease-in-out infinite; }
        }
        @keyframes techne-login-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.85; } }
        @media (max-width: 640px) {
          .techne-login-illustration { max-width: 60vw; }
          .techne-login-card { padding: 24px 20px; border-radius: 24px; margin-top: 14px; }
          .techne-login-title { font-size: 18px; }
        }
        @media (max-width: 420px) {
          .techne-login-chips { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 300px) {
          .techne-login-chips { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>

      <BackgroundTexture />

      <div className="techne-login-header">
        <div className="techne-login-brand">
          <div className="techne-login-brand-logo">T</div>
          <div className="techne-login-brand-line" />
          <div>
            <div className="techne-login-brand-name">Techne Soluciones</div>
            <div className="techne-login-brand-sub">CONSULTORÍA TÉCNICA EUROPEA</div>
          </div>
        </div>
        <FootprintIllustration />
      </div>

      <div className="techne-login-card">
        <div className="techne-login-card-head">
          <div className="techne-login-app-icon">
            T
            <span className="techne-login-app-icon-leaf">
              <LeafIcon size={11} color="#fff" />
            </span>
          </div>
          <div className="techne-login-card-head-text">
            <h1 className="techne-login-title">Calculadora de Huella de Carbono</h1>
            <div className="techne-login-subtitle">
              Techne Soluciones · <span className="techne-login-secure">Acceso seguro</span>
            </div>
          </div>
        </div>

        <p className="techne-login-copy">
          Inicia sesión con tu cuenta de technesoluciones.es para acceder a tus cálculos,
          indicadores y reportes de sostenibilidad.
        </p>

        <div className="techne-login-chips">
          <BenefitChip label="Medición" icon={<MeasureIcon />} />
          <BenefitChip label="Reducción" icon={<ReduceIcon />} />
          <BenefitChip label="Reportes" icon={<ReportIcon />} />
        </div>

        <button
          type="button"
          onClick={onLogin}
          className="techne-login-btn"
          aria-label="Ir al login de Techne Soluciones"
        >
          <span>Ir al login</span>
          <ArrowIcon />
        </button>

        <div className="techne-login-shield">
          <ShieldIcon />
          <span>Acceso corporativo seguro</span>
        </div>
      </div>

      <div className="techne-login-tagline">
        <LeafIcon size={15} color={LOGIN.greenText} />
        <span>Mide tu impacto. Optimiza tu huella.</span>
      </div>
    </div>
  );
}

function BenefitChip({ icon, label }) {
  return (
    <div className="techne-login-chip">
      <span className="techne-login-chip-icon" aria-hidden="true">{icon}</span>
      <span className="techne-login-chip-label">{label}</span>
    </div>
  );
}

function MeasureIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="9" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 9v3M11 9v3M15 9v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ReduceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5c7 0 9 4 9 9M13 14c3 0 4-1.5 4-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 14l5 2M13 14l1.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 19l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ReportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6l7-3z" stroke={LOGIN.muted} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4.5" stroke={LOGIN.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LeafIcon({ size = 16, color = LOGIN.green }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19c-1-7 3-13 14-14 1 11-5 15-14 14z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 18c3-4 6-7 12-13" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function FootprintIllustration() {
  return (
    <svg
      className="techne-login-illustration"
      viewBox="0 0 260 130"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M20 105c-6-30 8-58 48-63 5 40-14 65-48 63z" fill={LOGIN.greenSoft} stroke={LOGIN.green} strokeWidth="1.6" />
      <path d="M26 100c8-18 18-32 38-52" stroke={LOGIN.green} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />

      <rect x="86" y="30" width="34" height="20" rx="10" fill={LOGIN.sky} />
      <text x="103" y="44" textAnchor="middle" fontSize="10" fontWeight="700" fill={LOGIN.navy} fontFamily="system-ui, sans-serif">CO₂</text>

      <g>
        <rect x="146" y="70" width="8" height="20" rx="1.5" fill={LOGIN.blue} opacity="0.85" />
        <rect x="158" y="58" width="8" height="32" rx="1.5" fill={LOGIN.navy} opacity="0.9" />
        <rect x="170" y="46" width="8" height="44" rx="1.5" fill={LOGIN.green} opacity="0.9" />
      </g>

      <polyline points="140,26 158,34 172,18 188,24" fill="none" stroke={LOGIN.green} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

      <g transform="translate(220,60)">
        <circle r="18" fill="none" stroke={LOGIN.border} strokeWidth="7" />
        <circle r="18" fill="none" stroke={LOGIN.navy} strokeWidth="7" strokeDasharray="70 113" strokeLinecap="round" transform="rotate(-90)" />
        <circle r="18" fill="none" stroke={LOGIN.green} strokeWidth="7" strokeDasharray="30 113" strokeDashoffset="-70" strokeLinecap="round" transform="rotate(-90)" />
      </g>

      <g stroke={LOGIN.border} strokeWidth="1" strokeDasharray="3 4" opacity="0.9">
        <path d="M68 60L98 42" />
        <path d="M122 40L146 58" />
        <path d="M182 50L204 58" />
      </g>
      <circle className="techne-login-dot" cx="68" cy="60" r="2.5" fill={LOGIN.green} />
      <circle className="techne-login-dot" cx="122" cy="40" r="2.5" fill={LOGIN.blue} />
      <circle className="techne-login-dot" cx="204" cy="58" r="2.5" fill={LOGIN.navy} />
    </svg>
  );
}

function BackgroundTexture() {
  return (
    <svg className="techne-login-texture" viewBox="0 0 800 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true" role="presentation">
      <defs>
        <pattern id="techne-login-dots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4" fill={LOGIN.blue} opacity="0.16" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="800" height="220" fill="url(#techne-login-dots)" />
      <path d="M-40 260C160 200 300 320 480 250S760 180 860 240" stroke={LOGIN.navy} strokeWidth="1" fill="none" opacity="0.08" />
      <path d="M-40 300C180 360 340 220 520 300S780 340 860 290" stroke={LOGIN.green} strokeWidth="1" fill="none" opacity="0.08" />
    </svg>
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
function TextInput({ label, value, onChange, placeholder, w = 220 }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11.5, color: COL.mist }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: w, maxWidth: '100%', padding: '8px 10px', borderRadius: 8,
          border: `1px solid ${COL.line}`, fontSize: 13, color: COL.ink,
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
function ComponentRow({ comp, setComp, hint, error, authHeaders }) {
  const [errorUpload, setErrorUpload] = useState('');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorUpload('');
    setComp((prev) => ({
      ...prev,
      leyendo: true,
      origen: null,
      archivoNombre: file.name,
    }));

    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const response = await fetch('/api/hcc/extraer-dap', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo analizar la DAP');
      }

      setComp((prev) => ({
        ...prev,
        leyendo: false,
        origen: 'pdf',
        valor: data.gwp_valor ?? 0,
        unidad: data.gwp_unidad ?? prev.unidad,
        archivoNombre: file.name,
        pagina: data.cita_pagina || 'Referencia no indicada',
        confianza: data.confianza,
        validacion: data.estado_validacion,
        mensajeValidacion: data.mensaje,
        productoExtraido: data.producto,
        proveedorExtraido: data.proveedor,
        programaExtraido: data.programa,
      }));
    } catch (error) {
      setErrorUpload(error instanceof Error ? error.message : 'Error inesperado');
      setComp((prev) => ({ ...prev, leyendo: false, origen: null }));
    } finally {
      e.target.value = '';
    }
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

      {errorUpload && !comp.leyendo && (
        <div style={{
          padding: '10px 12px', background: '#FDEEEE', borderRadius: 8,
          fontSize: 12.5, color: '#A33A3A', marginBottom: 12,
          border: '1px solid #F3CACA',
        }}>
          No se pudo leer la DAP: {errorUpload}
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
            Extraído de <b>{comp.archivoNombre}</b> — {comp.pagina}.
            {comp.confianza != null && ` Confianza: ${Math.round(comp.confianza * 100)}%.`}
            {' '}Revisa el valor antes de continuar.
          </span>
        </div>
      )}

      {comp.origen === 'pdf' && comp.mensajeValidacion && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 12,
          color: comp.validacion === 'atipico' ? '#9A5A0A' : COL.slate,
          background: comp.validacion === 'atipico' ? '#FBF4E9' : COL.paper,
          marginBottom: 12,
        }}>
          {comp.mensajeValidacion}
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
              {error && <div style={{ color: '#A33A3A', fontSize: 11, marginTop: 4 }}>{error}</div>}
            </div>
          )}
          {comp.unidad === 'kg_ud' && (
            <div>
              <div style={{ fontSize: 11.5, color: COL.mist, marginBottom: 4 }}>Cantidad</div>
              <NumberInput value={comp.cantidad} onChange={(v) => setComp({ ...comp, cantidad: v })} suffix="ud" w={70} />
              {error && <div style={{ color: '#A33A3A', fontSize: 11, marginTop: 4 }}>{error}</div>}
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
function Next({ onClick, label = 'Continuar →', disabled = false }) {
  return (
    <div style={{ marginTop: 26, display: 'flex', justifyContent: 'flex-end' }}>
      <button
        style={{
          ...btnPrimary,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: disabled ? 'none' : btnPrimary.boxShadow,
        }}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </button>
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
