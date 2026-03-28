export type Opportunity = {
  id: string;
  title: string;
  description: string;
  agency: string;
  geographies: string[];
  focusAreas: string[];
  amount?: number;
  deadline?: string;
  createdAt: string;
};
