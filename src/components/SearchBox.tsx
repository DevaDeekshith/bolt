import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Filter, X, Clock, Loader2 } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface SearchBoxProps {
  onSearch: (query: string) => void;
  onLocationSearch: (location: string) => void;
  currentLocation?: string;
  isSearching?: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFiltersCount: number;
}

export const SearchBox: React.FC<SearchBoxProps> = ({ 
  onSearch, 
  onLocationSearch,
  currentLocation,
  isSearching = false,
  showFilters,
  onToggleFilters,
  activeFiltersCount
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState(currentLocation || '');
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [showLocationHistory, setShowLocationHistory] = useState(false);
  
  const [searchHistory, setSearchHistory] = useLocalStorage<string[]>('store-search-history', []);
  const [locationHistory, setLocationHistory] = useLocalStorage<string[]>('location-search-history', []);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const debouncedLocationQuery = useDebounce(locationQuery, 300);

  // Trigger search when debounced query changes and meets minimum length
  useEffect(() => {
    if (debouncedSearchQuery.length >= 2 || debouncedSearchQuery.length === 0) {
      onSearch(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, onSearch]);

  // Trigger location search when debounced location changes
  useEffect(() => {
    if (debouncedLocationQuery.length >= 2 && debouncedLocationQuery !== currentLocation) {
      onLocationSearch(debouncedLocationQuery);
    }
  }, [debouncedLocationQuery, onLocationSearch, currentLocation]);

  // Update location query when currentLocation changes
  useEffect(() => {
    if (currentLocation && currentLocation !== locationQuery) {
      setLocationQuery(currentLocation);
    }
  }, [currentLocation]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && searchQuery.length >= 2) {
      addToSearchHistory(searchQuery.trim());
      onSearch(searchQuery.trim());
      setShowSearchHistory(false);
    }
  };

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locationQuery.trim()) {
      addToLocationHistory(locationQuery.trim());
      onLocationSearch(locationQuery.trim());
      setShowLocationHistory(false);
    }
  };

  const addToSearchHistory = (query: string) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 5); // Keep only 5 recent searches
    });
  };

  const addToLocationHistory = (location: string) => {
    setLocationHistory(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== location.toLowerCase());
      return [location, ...filtered].slice(0, 5); // Keep only 5 recent locations
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    onSearch('');
    searchInputRef.current?.focus();
  };

  const clearLocation = () => {
    setLocationQuery('');
    locationInputRef.current?.focus();
  };

  const selectFromHistory = (query: string, type: 'search' | 'location') => {
    if (type === 'search') {
      setSearchQuery(query);
      onSearch(query);
      setShowSearchHistory(false);
    } else {
      setLocationQuery(query);
      onLocationSearch(query);
      setShowLocationHistory(false);
    }
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    setShowSearchHistory(false);
  };

  const clearLocationHistory = () => {
    setLocationHistory([]);
    setShowLocationHistory(false);
  };

  return (
    <div className="clean-glass rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Search Input */}
        <div className="relative">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search stores... (min 2 characters)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearchHistory(searchHistory.length > 0)}
              onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
              className="clean-input w-full pl-12 pr-12 py-4 rounded-xl focus-ring"
            />
            
            {/* Loading indicator */}
            {isSearching && (
              <Loader2 className="absolute right-12 top-1/2 transform -translate-y-1/2 text-primary w-5 h-5 animate-spin" />
            )}
            
            {/* Clear button */}
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Search History Dropdown */}
          {showSearchHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 clean-glass-strong rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
                <span className="text-sm font-medium text-muted flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Searches
                </span>
                <button
                  onClick={clearSearchHistory}
                  className="text-sm text-muted hover:text-body transition-colors"
                >
                  Clear
                </button>
              </div>
              {searchHistory.map((query, index) => (
                <button
                  key={index}
                  onClick={() => selectFromHistory(query, 'search')}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm text-body transition-colors mobile-touch"
                >
                  {query}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Location Input */}
        <div className="relative">
          <form onSubmit={handleLocationSubmit} className="relative">
            <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input
              ref={locationInputRef}
              type="text"
              placeholder="Enter your location..."
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              onFocus={() => setShowLocationHistory(locationHistory.length > 0)}
              onBlur={() => setTimeout(() => setShowLocationHistory(false), 200)}
              className="clean-input w-full pl-12 pr-12 py-4 rounded-xl focus-ring"
            />
            
            {/* Clear button */}
            {locationQuery && (
              <button
                type="button"
                onClick={clearLocation}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Location History Dropdown */}
          {showLocationHistory && locationHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 clean-glass-strong rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
                <span className="text-sm font-medium text-muted flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Locations
                </span>
                <button
                  onClick={clearLocationHistory}
                  className="text-sm text-muted hover:text-body transition-colors"
                >
                  Clear
                </button>
              </div>
              {locationHistory.map((location, index) => (
                <button
                  key={index}
                  onClick={() => selectFromHistory(location, 'location')}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm text-body transition-colors mobile-touch"
                >
                  {location}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter Toggle and Tips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={onToggleFilters}
          className={`clean-button flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 mobile-touch ${
            showFilters 
              ? 'bg-blue-50/80 text-primary border-blue-200/50' 
              : 'text-body hover:text-heading'
          }`}
        >
          <Filter className="w-5 h-5" />
          <span className="font-medium">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="bg-primary text-white text-sm px-2 py-1 rounded-full min-w-[24px] text-center font-medium">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Search Tips */}
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Search updates automatically as you type</span>
          <span className="sm:hidden">Auto-search enabled</span>
        </div>
      </div>
    </div>
  );
};