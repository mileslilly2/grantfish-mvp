export type Opportunity = {
  id: string;
  title: string;
  description: string;
  agency: string;
  geographies: string | string[];
  focusAreas: string | string[];
  amount?: number;
  deadline?: string;
  createdAt: string;
};
