export interface CaseStudyDetailPlanStep {
  phase: string;
  description: string;
}

export interface CaseStudyDetail {
  context: string;
  problem: string[];
  approach: string[];
  deliverables: string[];
  commercialProposal: CaseStudyDetailPlanStep[];
  keyMessage: string;
}

export interface CaseStudy {
  slug: string;
  titleEs: string;
  titleEn: string;
  summaryEs: string;
  summaryEn: string;
  detailEs: CaseStudyDetail;
  detailEn: CaseStudyDetail;
  imageUrl: string;
  iconSvg: string;
  tags?: string[];
  link?: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'wasteops-optimization-ai-implementation',
    titleEs: 'WasteOps en obra: optimización de recursos de residuos con algoritmos + base de datos propia',
    titleEn: 'WasteOps on Site: Waste Resource Optimization with Algorithms + Proprietary Database',
    summaryEs:
      'Desarrollamos con éxito una aplicación para una empresa grande del sector construcción que permite analizar datos reales de obra y optimizar la gestión de residuos (planificación, logística y control), apoyándose en algoritmos de optimización y una base de datos controlada. Ahora lo convertimos en un caso de estudio y gancho comercial para ofrecer un servicio de diagnóstico + implementación de IA en constructoras con fallos detectados y datos disponibles.',
    summaryEn:
      'We successfully developed an application for a large construction company that analyzes real jobsite data and optimizes waste management (planning, logistics, and control), using optimization algorithms and a controlled database. We are now turning it into a case study and commercial hook to offer a diagnostics + AI implementation service for construction companies with identified issues and available data.',
    detailEs: {
      context:
        'Proyecto aplicado a gestión de residuos en obra para una compañía de gran tamaño, con foco en convertir datos operativos en decisiones.',
      problem: [
        'Retiradas reactivas, baja trazabilidad, impropios/mezclas, costes logísticos altos y datos dispersos (albaranes, proveedores, obra).',
      ],
      approach: [
        'Base de datos propia y controlada (modelo unificado por obra/fracción/retirada/incidencia/evidencia).',
        'Algoritmos de optimización de recursos para planificar contenedores, frecuencias, retiradas y rutas (según capacidad, restricciones y objetivos coste/CO₂/SLA).',
        'Capa IA/analítica para predicción, detección de anomalías y reporting (KPIs por obra/proveedor, desviaciones y oportunidades).',
      ],
      deliverables: [
        'Aplicación operativa + dashboards (operativo y ejecutivo).',
        'Motor de planificación.',
        'Trazabilidad documental.',
        'Plan de escalado a producción.',
      ],
      commercialProposal: [
        {
          phase: 'Diagnóstico + Data Readiness (2 semanas)',
          description: 'Auditoría de datos, mapa de fallos, KPIs base y plan de piloto.',
        },
        {
          phase: 'Piloto implementado (6–8 semanas)',
          description: 'BD mínima viable + optimización + dashboard + validación con KPIs.',
        },
        {
          phase: 'Producción y escalado',
          description: 'Integraciones, gobierno del dato y operación del sistema (MLOps/monitorización).',
        },
      ],
      keyMessage:
        'No es “IA por IA”; es decisión operativa basada en dato propio, con impacto medible y escalable.',
    },
    detailEn: {
      context:
        'Project applied to on-site waste management for a large company, focused on turning operational data into decisions.',
      problem: [
        'Reactive pickups, low traceability, contamination/mixed fractions, high logistics costs, and fragmented data (delivery notes, suppliers, jobsite records).',
      ],
      approach: [
        'Proprietary controlled database (unified model by site/fraction/pickup/incident/evidence).',
        'Resource optimization algorithms to plan containers, frequencies, pickups, and routes (based on capacity, constraints, and cost/CO2/SLA objectives).',
        'AI/analytics layer for forecasting, anomaly detection, and reporting (KPIs by site/supplier, deviations, and opportunities).',
      ],
      deliverables: [
        'Operational application + dashboards (operational and executive).',
        'Planning engine.',
        'Document traceability.',
        'Production scale-up plan.',
      ],
      commercialProposal: [
        {
          phase: 'Diagnostics + Data Readiness (2 weeks)',
          description: 'Data audit, issue map, baseline KPIs, and pilot plan.',
        },
        {
          phase: 'Implemented pilot (6–8 weeks)',
          description: 'Minimum viable database + optimization + dashboard + KPI validation.',
        },
        {
          phase: 'Production and scale-up',
          description: 'Integrations, data governance, and system operations (MLOps/monitoring).',
        },
      ],
      keyMessage:
        'This is not AI for AI’s sake; it is data-driven operational decision-making with measurable and scalable impact.',
    },
    imageUrl: 'assets/cases/wasteops.svg',
    tags: [
      'gestión de residuos',
      'construcción',
      'optimización de recursos',
      'logística',
      'algoritmos',
      'IA aplicada',
      'data engineering',
      'base de datos propia',
      'trazabilidad',
      'circularidad',
      'KPIs',
      'pilotos',
      'escalado a producción',
    ],
    iconSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75 13.5 13.5m0 0a3 3 0 10-4.243-4.243A3 3 0 0013.5 13.5zM3 12a9 9 0 1118 0 9 9 0 01-18 0z"/></svg>',
  },
  {
    slug: 'ce-marking-eta-acelerado-ia',
    titleEs: 'CE-Marking (ETA) acelerado con IA: automatización documental y optimización del proceso para productos de construcción',
    titleEn: 'AI-Accelerated CE-Marking (ETA): Document Automation and Process Optimization for Construction Products',
    summaryEs:
      'Implementamos un enfoque basado en IA para acelerar y robustecer proyectos de marcado CE en construcción, especialmente ETA (Evaluación Técnica Europea) para productos de construcción. El sistema reduce tiempos y retrabajos mediante automatización documental, extracción y verificación de requisitos, generación de evidencias y optimización del flujo de trabajo (recursos, hitos y coordinación con laboratorio/notified body). Resultado: procesos más rápidos, trazables y con menor riesgo de no conformidades.',
    summaryEn:
      'We implemented an AI-based approach to accelerate and strengthen CE-marking projects in construction, especially ETA (European Technical Assessment) for construction products. The system reduces time and rework through document automation, requirement extraction and verification, evidence generation, and workflow optimization (resources, milestones, and coordination with lab/notified body). Result: faster, traceable processes with lower non-conformity risk.',
    detailEs: {
      context:
        'Proyectos de marcado CE y obtención de ETA para productos de construcción, donde la carga documental, el control de versiones y la consistencia entre ensayos, EAD/ETAG, FPC y DoP suele ser el cuello de botella.',
      problem: [
        'Documentación dispersa y repetitiva (fichas técnicas, ensayos, FPC, manuales, declaraciones).',
        'Retrabajo por cambios, incoherencias y falta de trazabilidad de requisitos.',
        'Dificultad para coordinar recursos (técnicos, laboratorio, fabricación) y mantener el “hilo” del expediente.',
      ],
      approach: [
        'Extracción y estructuración de requisitos desde EAD/ETAG, ensayos y especificaciones: matriz de cumplimiento, evidencias y gaps.',
        'Automatización documental: generación/actualización de secciones repetitivas, control de versiones, checklist de consistencia (valores, unidades, nomenclatura, referencias cruzadas).',
        'Optimización del workflow: planificación de tareas y recursos (quién hace qué, cuándo, dependencias), priorización de “bloqueos” y reducción de tiempos muertos.',
        'Base de conocimiento controlada (plantillas, criterios, lecciones aprendidas) para estandarizar expedientes y acelerar iteraciones futuras.',
      ],
      deliverables: [
        'Matriz de requisitos + evidencias (ETA/CE) con trazabilidad completa.',
        'Paquete documental estandarizado (plantillas + control de cambios).',
        'Dashboard de estado del expediente (hitos, bloqueos, riesgos, pendientes).',
        'Plan de escalado: integración con repositorios, firmas, auditoría, y gobierno documental.',
      ],
      commercialProposal: [
        {
          phase: 'Assessment rápido (1–2 semanas)',
          description: 'Diagnóstico del expediente, mapa de gaps, plan de aceleración.',
        },
        {
          phase: 'Implementación (4–8 semanas)',
          description: 'Automatización documental + matriz de cumplimiento + flujo de trabajo y trazabilidad.',
        },
        {
          phase: 'Escalado',
          description: 'Estandarización multi-producto, biblioteca de plantillas, formación de equipo y mejora continua.',
        },
      ],
      keyMessage:
        'Reducimos el esfuerzo manual y el riesgo del CE-Marking/ETA convirtiendo el expediente en un sistema trazable, no en “carpetas sueltas”.',
    },
    detailEn: {
      context:
        'CE-marking and ETA projects for construction products, where documentation load, version control, and consistency across tests, EAD/ETAG, FPC, and DoP are often the main bottlenecks.',
      problem: [
        'Scattered and repetitive documentation (technical sheets, tests, FPC, manuals, declarations).',
        'Rework due to changes, inconsistencies, and lack of requirement traceability.',
        'Difficulty coordinating resources (technical team, lab, manufacturing) while maintaining the full dossier thread.',
      ],
      approach: [
        'Requirement extraction and structuring from EAD/ETAG, tests, and specs: compliance matrix, evidence, and gaps.',
        'Document automation: generation/update of repetitive sections, version control, consistency checklist (values, units, nomenclature, cross-references).',
        'Workflow optimization: planning tasks and resources (who does what, when, dependencies), prioritizing blockers, and reducing idle time.',
        'Controlled knowledge base (templates, criteria, lessons learned) to standardize dossiers and speed up future iterations.',
      ],
      deliverables: [
        'Requirements + evidence matrix (ETA/CE) with full traceability.',
        'Standardized document package (templates + change control).',
        'Dossier status dashboard (milestones, blockers, risks, pending tasks).',
        'Scale-up plan: integration with repositories, signatures, auditing, and document governance.',
      ],
      commercialProposal: [
        {
          phase: 'Rapid assessment (1–2 weeks)',
          description: 'Dossier diagnosis, gap map, acceleration plan.',
        },
        {
          phase: 'Implementation (4–8 weeks)',
          description: 'Document automation + compliance matrix + workflow and traceability.',
        },
        {
          phase: 'Scale-up',
          description: 'Multi-product standardization, template library, team training, and continuous improvement.',
        },
      ],
      keyMessage:
        'We reduce manual effort and CE-Marking/ETA risk by turning the dossier into a traceable system, not a set of loose folders.',
    },
    imageUrl: 'assets/cases/ce-marking-eta.svg',
    tags: [
      'CE marking',
      'ETA',
      'productos de construcción',
      'documentación técnica',
      'cumplimiento normativo',
      'automatización',
      'IA aplicada',
      'optimización de procesos',
      'gestión documental',
      'trazabilidad',
      'EAD/ETAG',
      'FPC',
      'DoP',
      'calidad',
      'estandarización',
    ],
    iconSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  },
];
