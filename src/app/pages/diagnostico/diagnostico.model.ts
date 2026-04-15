export interface DiagnosticoForm {
  empresa: string;
  sector: string;
  sectorCustom: string;
  pais: string;
  actividad: string;
  empleados: string;
  certs: string[];
  docState: string;
  urgencia: number;
  problemas: string[];
  extra: string;
}

export interface DiagnosticoResult {
  normas: string;
  brechas: string;
  resumen: string;
  flujo: string;
  precio_rango: string;
  retainer: string;
}

export type Screen =
  'intro' | 'step1' | 'step2' | 'step3' | 'loading' | 'report';
