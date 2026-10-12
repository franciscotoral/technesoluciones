import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

type Category = 'all'|'tools'|'inspection'|'regulations'|'management'|'optimisation';
interface Card { id:string; category:Exclude<Category,'all'>; es:string; en:string; descEs:string; descEn:string; modeEs:string; modeEn:string; ctaEs:string; ctaEn:string; href:string; live:boolean; accent:string; }

@Component({selector:'app-home',templateUrl:'./home.component.html',styleUrls:['./home.component.scss'],changeDetection:ChangeDetectionStrategy.OnPush,standalone:true,imports:[HeaderComponent,FooterComponent,RouterLink]})
export class HomeComponent implements AfterViewInit, OnDestroy {
  readonly i18n=inject(LanguageService); readonly filter=signal<Category>('all'); readonly activeIndex=signal(0);
  private readonly host=inject(ElementRef<HTMLElement>);
  private readonly zone=inject(NgZone);
  private carouselTrack:HTMLElement|null=null;
  private pointerStartX:number|null=null;
  private wheelDeltaX=0;
  private wheelLocked=false;
  private wheelResetTimer:ReturnType<typeof setTimeout>|null=null;
  private wheelUnlockTimer:ReturnType<typeof setTimeout>|null=null;
  private readonly onTrackpadWheel=(event:WheelEvent)=>{
    if(Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
    event.preventDefault();
    if(this.wheelLocked)return;
    this.wheelDeltaX+=event.deltaX;
    if(this.wheelResetTimer)clearTimeout(this.wheelResetTimer);
    this.wheelResetTimer=setTimeout(()=>{this.wheelDeltaX=0;},140);
    if(Math.abs(this.wheelDeltaX)<32)return;
    this.zone.run(()=>this.move(this.wheelDeltaX>0?1:-1));
    this.wheelDeltaX=0;
    this.wheelLocked=true;
    this.wheelUnlockTimer=setTimeout(()=>{this.wheelLocked=false;},550);
  };
  readonly filters=[{id:'all',es:'Todos',en:'All'},{id:'tools',es:'Herramientas',en:'Tools'},{id:'inspection',es:'Inspección',en:'Inspection'},{id:'regulations',es:'Normativa',en:'Regulations'},{id:'management',es:'Gestión',en:'Management'},{id:'optimisation',es:'Optimización',en:'Optimisation'}] as const;
  readonly cards:Card[]=[
    {id:'pipeline',category:'tools',es:'Pipeline de Construcción',en:'Construction Pipeline',descEs:'Radar de oportunidades, proyectos y productos del sector de la construcción.',descEn:'A radar for opportunities, projects and products in the construction sector.',modeEs:'Acceso gratuito',modeEn:'Free access',ctaEs:'Abrir herramienta',ctaEn:'Open tool',href:'/projects',live:true,accent:'#378add'},
    {id:'carbon',category:'tools',es:'Calculadora de Huella de Carbono',en:'Carbon Footprint Calculator',descEs:'Calcula y documenta la huella de carbono de proyectos, productos y actividades.',descEn:'Calculate and document the carbon footprint of projects, products and activities.',modeEs:'Disponible según plan',modeEn:'Available by plan',ctaEs:'Ver planes',ctaEn:'View plans',href:'#plans',live:true,accent:'#1d9e75'},
    {id:'diagnostic',category:'regulations',es:'Diagnóstico Normativo',en:'Regulatory Assessment',descEs:'Identifica requisitos y posibles brechas de cumplimiento normativo.',descEn:'Identify regulatory requirements and potential compliance gaps.',modeEs:'Evaluación inicial gratuita',modeEn:'Free initial assessment',ctaEs:'Iniciar diagnóstico',ctaEn:'Start assessment',href:'/diagnostico',live:true,accent:'#7f77dd'},
    {id:'ite',category:'inspection',es:'Informes ITE · IEE',en:'ITE · IEE Reports',descEs:'Digitaliza inspecciones, recopila evidencias y genera informes técnicos.',descEn:'Digitise inspections, collect evidence and generate technical reports.',modeEs:'Servicio por proyecto',modeEn:'Project-based service',ctaEs:'Solicitar estudio',ctaEn:'Request a study',href:'mailto:francisco.toral@technesoluciones.es?subject=Informes%20ITE%20IEE',live:false,accent:'#ef9f27'},
    {id:'facility',category:'management',es:'Facility Management IA',en:'AI Facility Management',descEs:'Centraliza el mantenimiento de activos e instalaciones y anticipa posibles fallos.',descEn:'Centralise asset and facility maintenance and anticipate potential failures.',modeEs:'Servicio por suscripción',modeEn:'Subscription service',ctaEs:'Solicitar acceso',ctaEn:'Request access',href:'mailto:francisco.toral@technesoluciones.es?subject=Facility%20Management%20IA',live:false,accent:'#00a86b'},
    {id:'urban',category:'regulations',es:'Normativa Urbanística y CTE',en:'Planning Regulations & CTE',descEs:'Identifica la normativa urbanística y técnica aplicable a cada local, inmueble o actividad.',descEn:'Identify the planning and technical regulations applicable to each premises, property or activity.',modeEs:'Consulta o proyecto',modeEn:'Consultation or project',ctaEs:'Solicitar análisis',ctaEn:'Request analysis',href:'mailto:francisco.toral@technesoluciones.es?subject=Normativa%20urbanistica%20y%20CTE',live:false,accent:'#c084fc'},
    {id:'systems',category:'management',es:'Sistemas Constructivos',en:'Construction Systems',descEs:'Compara alternativas, costes de ciclo de vida y necesidades de mantenimiento.',descEn:'Compare alternatives, lifecycle costs and maintenance requirements.',modeEs:'Estudio técnico',modeEn:'Technical study',ctaEs:'Comparar sistemas',ctaEn:'Compare systems',href:'mailto:francisco.toral@technesoluciones.es?subject=Sistemas%20constructivos',live:false,accent:'#d97706'},
    {id:'planning',category:'optimisation',es:'Planificación Inteligente de Obra',en:'Intelligent Construction Planning',descEs:'Optimiza la secuencia de actividades, identifica cuellos de botella y anticipa riesgos de retraso.',descEn:'Optimise activity sequencing, identify bottlenecks and anticipate delay risks.',modeEs:'Presupuesto según proyecto',modeEn:'Quote based on project',ctaEs:'Analizar mi proyecto',ctaEn:'Analyse my project',href:'mailto:francisco.toral@technesoluciones.es?subject=Planificacion%20inteligente',live:false,accent:'#2f7ed8'},
    {id:'resources',category:'optimisation',es:'Asignación Inteligente de Recursos',en:'Intelligent Resource Allocation',descEs:'Coordina cuadrillas, maquinaria y turnos reduciendo conflictos y tiempos ociosos.',descEn:'Coordinate crews, machinery and shifts while reducing conflicts and idle time.',modeEs:'Configuración + servicio mensual',modeEn:'Setup + monthly service',ctaEs:'Optimizar recursos',ctaEn:'Optimise resources',href:'mailto:francisco.toral@technesoluciones.es?subject=Asignacion%20de%20recursos',live:false,accent:'#0f9f88'},
    {id:'costs',category:'optimisation',es:'Predictor de Costes de Obra',en:'Construction Cost Predictor',descEs:'Detecta posibles desviaciones económicas con antelación y proyecta el coste final.',descEn:'Detect potential cost deviations early and forecast the final project cost.',modeEs:'Servicio mensual por proyecto',modeEn:'Monthly service per project',ctaEs:'Evaluar costes',ctaEn:'Assess costs',href:'mailto:francisco.toral@technesoluciones.es?subject=Predictor%20de%20costes',live:false,accent:'#d14f65'}
  ];
  readonly visible=computed(()=>this.filter()==='all'?this.cards:this.cards.filter(c=>c.category===this.filter()));
  ngAfterViewInit(){this.carouselTrack=this.host.nativeElement.querySelector('.track');this.zone.runOutsideAngular(()=>this.carouselTrack?.addEventListener('wheel',this.onTrackpadWheel,{passive:false}));}
  ngOnDestroy(){this.carouselTrack?.removeEventListener('wheel',this.onTrackpadWheel);if(this.wheelResetTimer)clearTimeout(this.wheelResetTimer);if(this.wheelUnlockTimer)clearTimeout(this.wheelUnlockTimer);}
  setFilter(value:Category){this.filter.set(value);this.activeIndex.set(0);}
  move(direction:-1|1){this.activeIndex.update(index=>Math.max(0,Math.min(this.visible().length-1,index+direction)));}
  cardPosition(index:number){const distance=index-this.activeIndex();return Math.max(-3,Math.min(3,distance));}
  isCardShown(index:number){return Math.abs(index-this.activeIndex())<=2;}
  onCarouselKeydown(event:KeyboardEvent){if(event.key==='ArrowLeft'){event.preventDefault();this.move(-1);}if(event.key==='ArrowRight'){event.preventDefault();this.move(1);}}
  onPointerDown(event:PointerEvent){this.pointerStartX=event.clientX;}
  onPointerUp(event:PointerEvent){if(this.pointerStartX===null)return;const delta=event.clientX-this.pointerStartX;this.pointerStartX=null;if(Math.abs(delta)>42)this.move(delta<0?1:-1);}
  onPointerCancel(){this.pointerStartX=null;}
  category(card:Card){const f=this.filters.find(x=>x.id===card.category);return this.i18n.lang()==='es'?f?.es:f?.en;}
}
