import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { InvestmentProperty } from '../../models/investment-property.model';

@Component({
  selector: 'app-property-card',
  templateUrl: './property-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, DecimalPipe],
})
export class PropertyCardComponent {
  property = input.required<InvestmentProperty>();

  fundingPercentage = computed(() => {
    const prop = this.property();
    if (prop.totalInvestment > 0) {
      return (prop.raisedAmount / prop.totalInvestment) * 100;
    }
    return 0;
  });
}
