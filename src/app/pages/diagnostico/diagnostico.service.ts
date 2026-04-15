import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DiagnosticoForm, DiagnosticoResult } from './diagnostico.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DiagnosticoService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  generar(form: DiagnosticoForm, lang: string): Observable<DiagnosticoResult> {
    return this.http
      .post<{ ok: boolean; result: DiagnosticoResult }>(
        `${this.base}/api/diagnostico`,
        { ...this.toSnakeCase(form), lang }
      )
      .pipe(map(r => r.result));
  }

  guardarLead(
    form: DiagnosticoForm,
    email: string,
    diagnostico: DiagnosticoResult
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.base}/api/lead`,
      {
        ...this.toSnakeCase(form),
        email,
        diagnostico_json: diagnostico
      }
    );
  }

  private toSnakeCase(form: DiagnosticoForm) {
    return {
      empresa: form.empresa,
      sector: form.sector,
      sector_custom: form.sectorCustom,
      pais: form.pais,
      actividad: form.actividad,
      empleados: form.empleados,
      certs: form.certs,
      doc_state: form.docState,
      urgencia: form.urgencia,
      problemas: form.problemas,
      extra: form.extra
    };
  }
}
