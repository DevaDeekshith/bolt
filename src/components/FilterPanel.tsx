import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { StoreFilters, FILTER_OPTIONS, DISTANCE_OPTIONS, SORT_OPTIONS } from '../types/filters';

interface FilterPanelProps {
  filters: StoreFilters;
  onFiltersChange: (filters: StoreFilters) => void;
  onClearFilters: () => void;
  isVisible: boolean;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  isVisible
}) => {
  if (!isVisible) return null;

  const handleFilterToggle = (filterId: string, category: keyof Omit<StoreFilters, 'distance' | 'sortBy'>) => {
    const currentFilters = filters[category] as string[];
    const newFilters = currentFilters.includes(filterId)
      ? currentFilters.filter(id => id !== filterId)
      : [...currentFilters, filterId];
    
    onFiltersChange({
      ...filters,
      [category]: newFilters
    });
  };

  const handleDistanceChange = (distance: number | null) => {
    onFiltersChange({
      ...filters,
      distance
    });
  };

  const handleSortChange = (sortBy: StoreFilters['sortBy']) => {
    onFiltersChange({
      ...filters,
      sortBy
    });
  };

  const getActiveFiltersCount = () => {
    return filters.hours.length + (filters.distance ? 1 : 0);
  };

  return (
    <div className="clean-glass-strong rounded-2xl p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-heading flex items-center gap-3">
          <span>Smart Filters</span>
          {getActiveFiltersCount() > 0 && (
            <span className="clean-button px-3 py-1 rounded-full text-sm font-medium">
              {getActiveFiltersCount()} active
            </span>
          )}
        </h3>
        
        <button
          onClick={onClearFilters}
          disabled={getActiveFiltersCount() === 0}
          className="clean-button flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 mobile-touch"
        >
          <RotateCcw className="w-4 h-4" />
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Hours */}
        <div className="space-y-4">
          <h4 className="font-semibold text-heading flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            Store Hours
          </h4>
          <div className="space-y-3">
            {FILTER_OPTIONS.map(option => (
              <label key={option.id} className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.hours.includes(option.id)}
                  onChange={() => handleFilterToggle(option.id, 'hours')}
                  className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-blue-500 focus:ring-2 transition-all duration-200"
                />
                <span className="ml-3 text-sm text-body group-hover:text-heading transition-colors">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Distance Filter */}
        <div className="space-y-4">
          <h4 className="font-semibold text-heading flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            Maximum Distance
          </h4>
          <div className="space-y-3">
            <label className="flex items-center cursor-pointer group">
              <input
                type="radio"
                name="distance"
                checked={filters.distance === null}
                onChange={() => handleDistanceChange(null)}
                className="w-4 h-4 text-primary border-slate-300 focus:ring-blue-500 focus:ring-2 transition-all duration-200"
              />
              <span className="ml-3 text-sm text-body group-hover:text-heading transition-colors">
                Any distance
              </span>
            </label>
            {DISTANCE_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  name="distance"
                  checked={filters.distance === option.value}
                  onChange={() => handleDistanceChange(option.value)}
                  className="w-4 h-4 text-primary border-slate-300 focus:ring-blue-500 focus:ring-2 transition-all duration-200"
                />
                <span className="ml-3 text-sm text-body group-hover:text-heading transition-colors">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Sort Options */}
        <div className="space-y-4">
          <h4 className="font-semibold text-heading flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            Sort By
          </h4>
          <select
            value={filters.sortBy}
            onChange={(e) => handleSortChange(e.target.value as StoreFilters['sortBy'])}
            className="clean-input w-full px-4 py-3 rounded-xl text-sm focus-ring"
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filters Summary */}
      {getActiveFiltersCount() > 0 && (
        <div className="mt-6 pt-6 border-t border-white/20">
          <h5 className="text-sm font-semibold text-muted mb-3">
            Active Filters
          </h5>
          <div className="flex flex-wrap gap-2">
            {filters.hours.map(hourId => {
              const option = FILTER_OPTIONS.find(opt => opt.id === hourId);
              return option ? (
                <span
                  key={hourId}
                  className="inline-flex items-center gap-2 px-3 py-2 clean-button rounded-xl text-xs font-medium mobile-touch"
                >
                  {option.label}
                  <button
                    onClick={() => handleFilterToggle(hourId, 'hours')}
                    className="hover:bg-white/20 rounded-full p-1 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : null;
            })}
            
            {filters.distance && (
              <span className="inline-flex items-center gap-2 px-3 py-2 clean-button rounded-xl text-xs font-medium mobile-touch">
                {filters.distance} km
                <button
                  onClick={() => handleDistanceChange(null)}
                  className="hover:bg-white/20 rounded-full p-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};