import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvestmentProperty } from '../../models/investment-property.model';
import { PropertyCardComponent } from '../property-card/property-card.component';

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, PropertyCardComponent]
})
export class PropertyListComponent {
  properties = input.required<InvestmentProperty[]>();
}
