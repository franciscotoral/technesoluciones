export interface InvestmentProperty {
  id: number;
  title: string;
  address: string;
  imageUrl: string;
  description: string;
  totalInvestment: number;
  raisedAmount: number;
  investors: number;
  expectedReturn: number; 
  propertyType: 'Residential' | 'Commercial' | 'Mixed-Use';
  loanToValue: number;
  isFeatured?: boolean;
}
