import { Injectable, signal } from '@angular/core';
import { InvestmentProperty } from '../models/investment-property.model';

@Injectable({
  providedIn: 'root',
})
export class PropertyService {
  private readonly properties = signal<InvestmentProperty[]>([
    {
      id: 1,
      title: 'The Grand Lofts',
      address: '123 Market St, San Francisco, CA',
      imageUrl: 'https://picsum.photos/seed/prop1/800/600',
      description: 'A stunning new mixed-use development in the heart of the city, featuring luxury residential units and prime retail space.',
      totalInvestment: 5000000,
      raisedAmount: 3750000,
      investors: 128,
      expectedReturn: 14.5,
      propertyType: 'Mixed-Use',
      loanToValue: 65,
      isFeatured: true,
    },
    {
      id: 2,
      title: 'Oceanview Apartments',
      address: '456 Pacific Ave, Miami, FL',
      imageUrl: 'https://picsum.photos/seed/prop2/800/600',
      description: 'Modern apartment complex with breathtaking ocean views, offering high-yield rental income potential.',
      totalInvestment: 2200000,
      raisedAmount: 1100000,
      investors: 76,
      expectedReturn: 12.8,
      propertyType: 'Residential',
      loanToValue: 70,
    },
    {
      id: 3,
      title: 'Downtown Business Center',
      address: '789 Commerce Blvd, Austin, TX',
      imageUrl: 'https://picsum.photos/seed/prop3/800/600',
      description: 'A Class-A office building in a rapidly growing tech hub, fully leased to established tenants.',
      totalInvestment: 7800000,
      raisedAmount: 6900000,
      investors: 45,
      expectedReturn: 11.2,
      propertyType: 'Commercial',
      loanToValue: 60,
    },
    {
        id: 4,
        title: 'Lakeside Villas',
        address: '101 Lake Rd, Denver, CO',
        imageUrl: 'https://picsum.photos/seed/prop4/800/600',
        description: 'Exclusive community of single-family rental homes with premium amenities and strong tenant demand.',
        totalInvestment: 3500000,
        raisedAmount: 1250000,
        investors: 92,
        expectedReturn: 13.1,
        propertyType: 'Residential',
        loanToValue: 68,
      },
  ]);

  getProperties() {
    return signal(this.properties().filter(p => !p.isFeatured));
  }

  getFeaturedProperty() {
    return signal(this.properties().find(p => p.isFeatured));
  }
}
