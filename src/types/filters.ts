export interface StoreFilters {
  hours: string[];
  distance: number | null;
  sortBy: 'distance' | 'alphabetical' | 'rating';
}

export interface FilterOption {
  id: string;
  label: string;
  category: keyof Omit<StoreFilters, 'distance' | 'sortBy'>;
}

export const FILTER_OPTIONS: FilterOption[] = [
  { id: 'open24', label: 'Open 24/7', category: 'hours' },
  { id: 'openSunday', label: 'Open Sundays', category: 'hours' },
  { id: 'openLate', label: 'Open Late (9PM+)', category: 'hours' },
];

export const DISTANCE_OPTIONS = [
  { value: 2, label: '< 2 km' },
  { value: 5, label: '< 5 km' },
  { value: 10, label: '< 10 km' },
  { value: 25, label: '< 25 km' },
  { value: 50, label: '< 50 km' },
];

export const SORT_OPTIONS = [
  { value: 'distance' as const, label: 'Distance' },
  { value: 'alphabetical' as const, label: 'Alphabetical' },
  { value: 'rating' as const, label: 'Rating' },
];