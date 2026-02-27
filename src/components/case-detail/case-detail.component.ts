import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CASE_STUDIES } from '../../data/case-studies.data';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-case-detail',
  templateUrl: './case-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
})
export class CaseDetailComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(LanguageService);

  readonly allCases = CASE_STUDIES;

  readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' }
  );

  readonly currentIndex = computed(() =>
    this.allCases.findIndex((item) => item.slug === this.slug())
  );

  readonly caseStudy = computed(() => {
    const idx = this.currentIndex();
    return idx >= 0 ? this.allCases[idx] : undefined;
  });

  readonly previousCase = computed(() => {
    const idx = this.currentIndex();
    if (idx <= 0) return null;
    return this.allCases[idx - 1];
  });

  readonly nextCase = computed(() => {
    const idx = this.currentIndex();
    if (idx < 0 || idx >= this.allCases.length - 1) return null;
    return this.allCases[idx + 1];
  });

  private summaryChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private compositionChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;

  constructor() {
    effect(() => {
      const cs = this.caseStudy();
      if (!cs || cs.slug !== 'wasteops-optimization-ai-implementation') {
        this.disposeCharts();
        return;
      }

      setTimeout(() => this.renderWasteOpsCharts(), 0);
    });
  }

  ngOnDestroy() {
    this.disposeCharts();
  }

  private renderWasteOpsCharts() {
    const echarts = window.echarts;
    if (!echarts) return;

    const summaryEl = document.getElementById('wasteops-summary-chart');
    const compositionEl = document.getElementById('wasteops-composition-chart');
    if (!summaryEl || !compositionEl) return;

    if (!this.summaryChart) this.summaryChart = echarts.init(summaryEl);
    if (!this.compositionChart) this.compositionChart = echarts.init(compositionEl);

    this.summaryChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: ['RCD total', 'Tierras', 'Mixtos', 'Hormigon'],
        axisLabel: { color: '#cbd5e1' },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#cbd5e1', formatter: '{value} tn' },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series: [
        {
          type: 'bar',
          data: [397.4, 3026.0, 244.8, 102.8],
          itemStyle: {
            color: (params: { dataIndex: number }) => ['#22d3ee', '#fb7185', '#a78bfa', '#34d399'][params.dataIndex],
            borderRadius: [8, 8, 0, 0],
          },
        },
      ],
    });

    this.compositionChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: '#cbd5e1' },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '42%'],
          label: { color: '#e2e8f0' },
          itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
          data: [
            { name: 'Mixtos', value: 61.64 },
            { name: 'Hormigon', value: 25.61 },
            { name: 'Yeso', value: 5.34 },
            { name: 'Madera', value: 4.03 },
            { name: 'Metales', value: 1.99 },
            { name: 'Plasticos', value: 1.24 },
            { name: 'Vidrio', value: 0.14 },
          ],
        },
      ],
    });

    this.summaryChart.resize();
    this.compositionChart.resize();
  }

  private disposeCharts() {
    this.summaryChart?.dispose();
    this.compositionChart?.dispose();
    this.summaryChart = null;
    this.compositionChart = null;
  }
}

declare global {
  interface Window {
    echarts?: {
      init: (el: HTMLElement) => {
        setOption: (option: unknown, opts?: { notMerge?: boolean }) => void;
        resize: () => void;
        dispose: () => void;
      };
    };
  }
}
