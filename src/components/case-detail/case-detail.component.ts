import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CASE_STUDIES } from '../../data/case-studies.data';
import { LanguageService } from '../../services/language.service';

interface EcoScenario {
  id: string;
  labelEs: string;
  labelEn: string;
  demand: number;
  baseline: {
    totalCost: number;
    co2: number;
    cardboardContainers: number;
    transshipments: number;
    costBreakdown: {
      production: number;
      transport: number;
      cardboardPurchase: number;
      transshipmentLabor: number;
      co2Penalty: number;
    };
  };
  optimized: {
    totalCost: number;
    co2: number;
    cardboardContainers: number;
    transshipments: number;
    costBreakdown: {
      production: number;
      transport: number;
      cardboardPurchase: number;
      transshipmentLabor: number;
      co2Penalty: number;
    };
  };
}

const ECO_SCENARIOS: EcoScenario[] = [
  {
    id: 'S1-stable-200',
    labelEs: 'Estable 200 u/día',
    labelEn: 'Stable 200 u/day',
    demand: 200,
    baseline: {
      totalCost: 384.67,
      co2: 2.16,
      cardboardContainers: 0,
      transshipments: 0,
      costBreakdown: {
        production: 110,
        transport: 270,
        cardboardPurchase: 0,
        transshipmentLabor: 0,
        co2Penalty: 2.59,
      },
    },
    optimized: {
      totalCost: 387.8,
      co2: 2.16,
      cardboardContainers: 0,
      transshipments: 0,
      costBreakdown: {
        production: 110,
        transport: 270,
        cardboardPurchase: 0,
        transshipmentLabor: 0,
        co2Penalty: 2.59,
      },
    },
  },
  {
    id: 'S2-inflection-250',
    labelEs: 'Inflexión 250 u/día',
    labelEn: 'Inflection 250 u/day',
    demand: 250,
    baseline: {
      totalCost: 482.75,
      co2: 2.64,
      cardboardContainers: 1,
      transshipments: 1,
      costBreakdown: {
        production: 137.5,
        transport: 330,
        cardboardPurchase: 3,
        transshipmentLabor: 7,
        co2Penalty: 3.17,
      },
    },
    optimized: {
      totalCost: 475.87,
      co2: 2.64,
      cardboardContainers: 0,
      transshipments: 0,
      costBreakdown: {
        production: 137.5,
        transport: 330,
        cardboardPurchase: 0,
        transshipmentLabor: 0,
        co2Penalty: 3.17,
      },
    },
  },
  {
    id: 'S3-volatile-320',
    labelEs: 'Alta/volátil 320 u/día',
    labelEn: 'High/volatile 320 u/day',
    demand: 320,
    baseline: {
      totalCost: 652.11,
      co2: 3.36,
      cardboardContainers: 5,
      transshipments: 5,
      costBreakdown: {
        production: 176,
        transport: 420,
        cardboardPurchase: 15,
        transshipmentLabor: 35,
        co2Penalty: 4.03,
      },
    },
    optimized: {
      totalCost: 605.24,
      co2: 3.36,
      cardboardContainers: 0,
      transshipments: 0,
      costBreakdown: {
        production: 176,
        transport: 420,
        cardboardPurchase: 0,
        transshipmentLabor: 0,
        co2Penalty: 4.03,
      },
    },
  },
  {
    id: 'S4-peak-450',
    labelEs: 'Pico 450 u/día',
    labelEn: 'Peak 450 u/day',
    demand: 450,
    baseline: {
      totalCost: 945.05,
      co2: 4.56,
      cardboardContainers: 12,
      transshipments: 12,
      costBreakdown: {
        production: 247.5,
        transport: 570,
        cardboardPurchase: 36,
        transshipmentLabor: 84,
        co2Penalty: 5.47,
      },
    },
    optimized: {
      totalCost: 828.18,
      co2: 4.56,
      cardboardContainers: 0,
      transshipments: 0,
      costBreakdown: {
        production: 247.5,
        transport: 570,
        cardboardPurchase: 0,
        transshipmentLabor: 0,
        co2Penalty: 5.47,
      },
    },
  },
];

const ECO_MARGIN_SIGNAL = [
  { scenario: 'S1', value: 3.13 },
  { scenario: 'S2', value: 6.88 },
  { scenario: 'S3', value: 46.87 },
  { scenario: 'S4', value: 116.87 },
];

@Component({
  selector: 'app-case-detail',
  templateUrl: './case-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink, DecimalPipe],
})
export class CaseDetailComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(LanguageService);

  readonly allCases = CASE_STUDIES;
  readonly ecoScenarios = ECO_SCENARIOS;
  readonly selectedEcoScenarioId = signal('S2-inflection-250');

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

  readonly selectedEcoScenario = computed(() =>
    this.ecoScenarios.find((s) => s.id === this.selectedEcoScenarioId()) ?? this.ecoScenarios[0]
  );

  private summaryChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private compositionChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private ecoSummaryChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private ecoCompositionChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private ecoSignalChart: { setOption: (option: unknown, opts?: { notMerge?: boolean }) => void; resize: () => void; dispose: () => void } | null = null;
  private echartsLoadingPromise: Promise<void> | null = null;

  constructor() {
    effect(() => {
      const cs = this.caseStudy();
      const scenarioId = this.selectedEcoScenarioId();
      if (!cs) {
        this.disposeCharts();
        return;
      }

      if (cs.slug === 'wasteops-optimization-ai-implementation') {
        setTimeout(() => { void this.renderWasteOpsCharts(); }, 0);
        return;
      }

      if (cs.slug === 'optimizacion-penalizacion-ambiental-integrada') {
        setTimeout(() => { void this.renderEcoOpsCharts(scenarioId); }, 0);
        return;
      }

      this.disposeCharts();
    });
  }

  ngOnDestroy() {
    this.disposeCharts();
  }

  selectEcoScenario(scenarioId: string) {
    this.selectedEcoScenarioId.set(scenarioId);
  }

  private async renderWasteOpsCharts(attempt = 0) {
    await this.ensureEcharts();
    const echarts = window.echarts;
    if (!echarts) return;

    const summaryEl = document.getElementById('wasteops-summary-chart');
    const compositionEl = document.getElementById('wasteops-composition-chart');
    if (!summaryEl || !compositionEl) {
      if (attempt < 8) setTimeout(() => this.renderWasteOpsCharts(attempt + 1), 120);
      return;
    }

    if (summaryEl.clientWidth === 0 || summaryEl.clientHeight === 0 || compositionEl.clientWidth === 0 || compositionEl.clientHeight === 0) {
      if (attempt < 8) setTimeout(() => this.renderWasteOpsCharts(attempt + 1), 120);
      return;
    }

    if (!this.summaryChart) this.summaryChart = echarts.init(summaryEl);
    if (!this.compositionChart) this.compositionChart = echarts.init(compositionEl);

    this.summaryChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: ['RCD total', 'Tierras', 'Mixtos', 'Hormigón'],
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
            { name: 'Hormigón', value: 25.61 },
            { name: 'Yeso', value: 5.34 },
            { name: 'Madera', value: 4.03 },
            { name: 'Metales', value: 1.99 },
            { name: 'Plásticos', value: 1.24 },
            { name: 'Vidrio', value: 0.14 },
          ],
        },
      ],
    });

    this.summaryChart.resize();
    this.compositionChart.resize();
  }

  private async renderEcoOpsCharts(scenarioId: string, attempt = 0) {
    await this.ensureEcharts();
    const echarts = window.echarts;
    if (!echarts) return;

    const scenario = this.ecoScenarios.find((s) => s.id === scenarioId) ?? this.ecoScenarios[0];

    const summaryEl = document.getElementById('ecoops-summary-chart');
    const compositionEl = document.getElementById('ecoops-composition-chart');
    const signalEl = document.getElementById('ecoops-signal-chart');
    if (!summaryEl || !compositionEl || !signalEl) {
      if (attempt < 8) setTimeout(() => this.renderEcoOpsCharts(scenarioId, attempt + 1), 120);
      return;
    }

    if (
      summaryEl.clientWidth === 0 || summaryEl.clientHeight === 0 ||
      compositionEl.clientWidth === 0 || compositionEl.clientHeight === 0 ||
      signalEl.clientWidth === 0 || signalEl.clientHeight === 0
    ) {
      if (attempt < 8) setTimeout(() => this.renderEcoOpsCharts(scenarioId, attempt + 1), 120);
      return;
    }

    if (!this.ecoSummaryChart) this.ecoSummaryChart = echarts.init(summaryEl);
    if (!this.ecoCompositionChart) this.ecoCompositionChart = echarts.init(compositionEl);
    if (!this.ecoSignalChart) this.ecoSignalChart = echarts.init(signalEl);

    this.ecoSummaryChart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#cbd5e1' } },
        grid: { left: 40, right: 20, top: 36, bottom: 28 },
        xAxis: {
          type: 'category',
          data: ['Coste total €/día', 'CO2 kg/día', 'Cartón u/día', 'Transshipment u/día'],
          axisLabel: { color: '#cbd5e1', fontSize: 11 },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#cbd5e1' },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          {
            name: 'Baseline IEO=10',
            type: 'bar',
            itemStyle: { color: '#fb7185', borderRadius: [8, 8, 0, 0] },
            data: [
              scenario.baseline.totalCost,
              scenario.baseline.co2,
              scenario.baseline.cardboardContainers,
              scenario.baseline.transshipments,
            ],
          },
          {
            name: 'Optimizado IEO=25',
            type: 'bar',
            itemStyle: { color: '#22d3ee', borderRadius: [8, 8, 0, 0] },
            data: [
              scenario.optimized.totalCost,
              scenario.optimized.co2,
              scenario.optimized.cardboardContainers,
              scenario.optimized.transshipments,
            ],
          },
        ],
      },
      { notMerge: true }
    );

    this.ecoCompositionChart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { textStyle: { color: '#cbd5e1' } },
        grid: { left: 40, right: 20, top: 36, bottom: 40 },
        xAxis: {
          type: 'category',
          data: ['Producción', 'Transporte', 'Cartón', 'Transshipment', 'Penalización CO2'],
          axisLabel: { color: '#cbd5e1', rotate: 20 },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#cbd5e1', formatter: '{value} €' },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          {
            name: 'Baseline IEO=10',
            type: 'bar',
            itemStyle: { color: '#f97316' },
            data: [
              scenario.baseline.costBreakdown.production,
              scenario.baseline.costBreakdown.transport,
              scenario.baseline.costBreakdown.cardboardPurchase,
              scenario.baseline.costBreakdown.transshipmentLabor,
              scenario.baseline.costBreakdown.co2Penalty,
            ],
          },
          {
            name: 'Optimizado IEO=25',
            type: 'bar',
            itemStyle: { color: '#10b981' },
            data: [
              scenario.optimized.costBreakdown.production,
              scenario.optimized.costBreakdown.transport,
              scenario.optimized.costBreakdown.cardboardPurchase,
              scenario.optimized.costBreakdown.transshipmentLabor,
              scenario.optimized.costBreakdown.co2Penalty,
            ],
          },
        ],
      },
      { notMerge: true }
    );

    this.ecoSignalChart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 32, bottom: 30 },
        xAxis: {
          type: 'category',
          data: ECO_MARGIN_SIGNAL.map((p) => p.scenario),
          axisLabel: { color: '#cbd5e1' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#cbd5e1', formatter: '{value} €' },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          {
            name: 'Sobrecoste evitable',
            type: 'bar',
            data: ECO_MARGIN_SIGNAL.map((p) => p.value),
            itemStyle: {
              color: (params: { dataIndex: number }) => (params.dataIndex < 2 ? '#f59e0b' : '#ef4444'),
              borderRadius: [8, 8, 0, 0],
            },
          },
        ],
      },
      { notMerge: true }
    );

    this.ecoSummaryChart.resize();
    this.ecoCompositionChart.resize();
    this.ecoSignalChart.resize();
  }

  private disposeCharts() {
    this.summaryChart?.dispose();
    this.compositionChart?.dispose();
    this.ecoSummaryChart?.dispose();
    this.ecoCompositionChart?.dispose();
    this.ecoSignalChart?.dispose();
    this.summaryChart = null;
    this.compositionChart = null;
    this.ecoSummaryChart = null;
    this.ecoCompositionChart = null;
    this.ecoSignalChart = null;
  }

  private ensureEcharts(): Promise<void> {
    if (window.echarts?.init) return Promise.resolve();
    if (this.echartsLoadingPromise) return this.echartsLoadingPromise;

    this.echartsLoadingPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-techne-echarts="1"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('ECharts script failed to load.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
      script.async = true;
      script.dataset['techneEcharts'] = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('ECharts script failed to load.'));
      document.head.appendChild(script);
    }).finally(() => {
      this.echartsLoadingPromise = null;
    });

    return this.echartsLoadingPromise;
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



