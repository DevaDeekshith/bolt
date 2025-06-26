import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store, UserLocation } from '../types/store';
import { StoreFilters } from '../types/filters';
import { fetchStores, subscribeToStoreUpdates, transformStoreData } from '../services/supabase';
import { PerformanceOptimizedMapService } from '../services/performanceOptimizedMapService';
import { LocationService } from '../services/locationService';
import { EnhancedNavigationService } from '../services/enhancedNavigationService';
import { SecurityUtils } from '../utils/securityUtils';
import { StoreList } from './StoreList';
import { SearchBox } from './SearchBox';
import { FilterPanel } from './FilterPanel';
import { MapContainer } from './MapContainer';
import { LoadingSpinner } from './LoadingSpinner';
import { EnhancedStoreCard } from './EnhancedStoreCard';
import { MapPin, Store as StoreIcon, Navigation, AlertCircle, MapPinIcon, Loader2, CheckCircle, Activity, Zap, RefreshCw } from 'lucide-react';

const DEFAULT_FILTERS: StoreFilters = {
  hours: [],
  distance: null,
  sortBy: 'distance'
};

export const EnhancedStoreLocator: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | undefined>();
  const [userLocation, setUserLocation] = useState<UserLocation | undefined>();
  const [searchLocation, setSearchLocation] = useState<UserLocation | undefined>();
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]> | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [filters, setFilters] = useState<StoreFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [distanceValidationResults, setDistanceValidationResults] = useState<Map<string, any>>(new Map());

  // Initialize services on component mount
  useEffect(() => {
    const initializeServices = async () => {
      try {
        console.log('Initializing enhanced services...');
        
        // Warm up performance optimized map service
        await PerformanceOptimizedMapService.warmUp();
        
        // Start location watching for real-time updates
        LocationService.startLocationWatch(
          (location) => {
            console.log('Location updated:', location);
            setUserLocation(location);
            
            // Update distances for all stores with validation
            if (stores.length > 0) {
              updateStoreDistances(stores, location);
            }
          },
          (error) => {
            console.warn('Location watch error:', error);
            setLocationError('Location tracking failed');
          }
        );
        
        // Restore session state if returning from navigation
        const sessionState = EnhancedNavigationService.restoreSessionState();
        if (sessionState.userLocation) {
          setUserLocation(sessionState.userLocation);
        }
        if (sessionState.selectedStore) {
          setSelectedStore(sessionState.selectedStore);
        }
        
        console.log('Enhanced services initialized');
      } catch (error) {
        console.error('Service initialization failed:', error);
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      LocationService.stopLocationWatch();
      EnhancedNavigationService.clearSessionState();
    };
  }, []);

  // Load stores and get initial location
  useEffect(() => {
    loadStoresData();
    getCurrentLocation();
    
    // Update performance stats periodically
    const statsInterval = setInterval(() => {
      const stats = PerformanceOptimizedMapService.getCacheStats();
      const locationStats = LocationService.getCacheStats();
      setPerformanceStats({ ...stats, locationStats });
    }, 10000); // Every 10 seconds

    return () => clearInterval(statsInterval);
  }, []);

  // Update store distances with validation
  const updateStoreDistances = useCallback(async (storeList: Store[], location: UserLocation) => {
    const updatedStores = LocationService.calculateDistancesForStores(storeList, location);
    setStores(updatedStores);

    // Validate distances for a few stores (for debugging/monitoring)
    if (process.env.NODE_ENV === 'development') {
      const validationPromises = updatedStores.slice(0, 3).map(async (store) => {
        if (store.lat && store.lng && store.distance) {
          try {
            const validation = await LocationService.validateDistanceWithGoogleMaps(
              location,
              { lat: store.lat, lng: store.lng }
            );
            return { storeId: store.id, validation };
          } catch (error) {
            return { storeId: store.id, error };
          }
        }
        return null;
      });

      const validationResults = await Promise.all(validationPromises);
      const validationMap = new Map();
      validationResults.forEach(result => {
        if (result) {
          validationMap.set(result.storeId, result.validation || result.error);
        }
      });
      setDistanceValidationResults(validationMap);
    }
  }, []);

  // Process store data with enhanced geocoding
  const processStoreWithCoordinates = useCallback(async (rawStore: any): Promise<Store | null> => {
    try {
      const transformedStore = transformStoreData(rawStore);
      
      // Sanitize location data
      const sanitizedLocation = SecurityUtils.sanitizeText(transformedStore.location, 200);
      if (!sanitizedLocation) {
        console.warn('Invalid location data for store:', transformedStore.name);
        return null;
      }
      
      const coordinates = await PerformanceOptimizedMapService.geocodeAddress(sanitizedLocation);
      
      if (coordinates) {
        // Validate coordinates
        const validation = LocationService.validateCoordinates(coordinates);
        if (!validation.isValid) {
          console.warn('Invalid coordinates for store:', transformedStore.name, validation.error);
          return null;
        }
        
        return {
          ...transformedStore,
          location: sanitizedLocation,
          lat: validation.coordinates!.lat,
          lng: validation.coordinates!.lng
        };
      }
      
      console.warn('Could not geocode store location:', sanitizedLocation);
      return null;
    } catch (error) {
      console.error('Error processing store:', error);
      
      // Log security event
      SecurityUtils.logSecurityEvent({
        type: 'invalid_input',
        details: `Store processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      return null;
    }
  }, []);

  // Enhanced real-time event handlers
  const handleStoreInsert = useCallback(async (payload: any) => {
    console.log('Handling enhanced store insert:', payload);
    const newStore = await processStoreWithCoordinates(payload.new);
    
    if (newStore) {
      setStores(prevStores => {
        const exists = prevStores.some(store => 
          store.name === newStore.name && store.location === newStore.location
        );
        if (exists) {
          return prevStores;
        }
        
        // Add distance if user location is available
        const effectiveLocation = searchLocation || userLocation;
        if (effectiveLocation && newStore.lat && newStore.lng) {
          newStore.distance = LocationService.calculateDistance(
            effectiveLocation.lat,
            effectiveLocation.lng,
            newStore.lat,
            newStore.lng
          );
        }
        
        return [...prevStores, newStore];
      });
    }
  }, [processStoreWithCoordinates, searchLocation, userLocation]);

  const handleStoreUpdate = useCallback(async (payload: any) => {
    console.log('Handling enhanced store update:', payload);
    const updatedStore = await processStoreWithCoordinates(payload.new);
    
    if (updatedStore) {
      setStores(prevStores => 
        prevStores.map(store => 
          (store.name === payload.old.Name && store.location === payload.old.Location) 
            ? updatedStore 
            : store
        )
      );
      
      // Update selected store if it's the one being updated
      setSelectedStore(prevSelected => 
        (prevSelected?.name === payload.old.Name && prevSelected?.location === payload.old.Location) 
          ? updatedStore 
          : prevSelected
      );
    }
  }, [processStoreWithCoordinates]);

  const handleStoreDelete = useCallback((payload: any) => {
    console.log('Handling enhanced store delete:', payload);
    const deletedName = payload.old.Name;
    const deletedLocation = payload.old.Location;
    
    setStores(prevStores => 
      prevStores.filter(store => 
        !(store.name === deletedName && store.location === deletedLocation)
      )
    );
    
    // Clear selected store if it's the one being deleted
    setSelectedStore(prevSelected => 
      (prevSelected?.name === deletedName && prevSelected?.location === deletedLocation) 
        ? undefined 
        : prevSelected
    );
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    console.log('Setting up enhanced real-time subscription...');
    
    const unsubscribe = subscribeToStoreUpdates(
      handleStoreInsert,
      handleStoreUpdate,
      handleStoreDelete
    );

    return () => {
      unsubscribe();
    };
  }, [handleStoreInsert, handleStoreUpdate, handleStoreDelete]);

  // Define filter and sort functions before they are used
  const applyFilters = useCallback((storeList: Store[], currentFilters: StoreFilters, effectiveLocation: UserLocation | undefined): Store[] => {
    let filtered = [...storeList];

    // Apply distance filter
    if (currentFilters.distance && effectiveLocation) {
      filtered = filtered.filter(store => 
        store.distance !== undefined && store.distance <= currentFilters.distance!
      );
    }

    // Apply hours filters
    if (currentFilters.hours.length > 0) {
      filtered = filtered.filter(store => {
        if (currentFilters.hours.includes('open24')) {
          return store.hours?.includes('24') || false;
        }
        if (currentFilters.hours.includes('openSunday')) {
          return !store.hours?.includes('Mon-Sat') || false;
        }
        if (currentFilters.hours.includes('openLate')) {
          return store.hours?.includes('PM') || false;
        }
        return true;
      });
    }

    return filtered;
  }, []);

  const sortStores = useCallback((storeList: Store[], sortBy: StoreFilters['sortBy']): Store[] => {
    const sorted = [...storeList];

    switch (sortBy) {
      case 'distance':
        return sorted.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      case 'alphabetical':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'rating':
        return sorted.sort((a, b) => ((b as any).rating || 0) - ((a as any).rating || 0));
      default:
        return sorted;
    }
  }, []);

  // Enhanced filtering and sorting with performance optimization
  const effectiveLocation = searchLocation || userLocation;
  
  const processedStores = useMemo(() => {
    let processed = [...stores];

    // Add distances if we have a reference location
    if (effectiveLocation) {
      processed = LocationService.calculateDistancesForStores(processed, effectiveLocation);
    }

    // Apply search filter with sanitization
    if (searchQuery.trim()) {
      const sanitizedQuery = SecurityUtils.sanitizeSearchQuery(searchQuery);
      if (sanitizedQuery) {
        const query = sanitizedQuery.toLowerCase();
        processed = processed.filter(store =>
          store.name.toLowerCase().includes(query) ||
          store.location.toLowerCase().includes(query)
        );
      }
    }

    // Apply filters
    processed = applyFilters(processed, filters, effectiveLocation);

    // Sort stores
    processed = sortStores(processed, filters.sortBy);

    return processed;
  }, [stores, searchQuery, filters, effectiveLocation, applyFilters, sortStores]);

  useEffect(() => {
    setFilteredStores(processedStores);
  }, [processedStores]);

  const loadStoresData = async () => {
    try {
      setLoading(true);
      setError(null);
      const storesData = await fetchStores();
      
      const storesWithCoordinates = await Promise.all(
        storesData.map(async (store: any) => {
          return await processStoreWithCoordinates(store);
        })
      );

      const validStores = storesWithCoordinates.filter((store): store is Store => store !== null);
      setStores(validStores);
      
      if (validStores.length === 0) {
        setError('No stores with valid locations found.');
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      setError(`Failed to load store data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Log security event
      SecurityUtils.logSecurityEvent({
        type: 'invalid_input',
        details: `Store loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      setLocationError(null);
      
      const location = await LocationService.getCurrentLocationWithFallback();
      
      setUserLocation(location);
      
      // Reverse geocode to get location name
      reverseGeocode(location);
    } catch (error) {
      console.error('Enhanced geolocation error:', error);
      setLocationError(error instanceof Error ? error.message : 'Failed to get location');
    } finally {
      setLocationLoading(false);
    }
  };

  const reverseGeocode = async (location: UserLocation) => {
    try {
      setLocationQuery(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  };

  const handleStoreSelect = (store: Store) => {
    setSelectedStore(store);
    setRouteCoordinates(undefined);
  };

  const handleGetDirections = async (store: Store) => {
    if (!effectiveLocation || !store.lat || !store.lng) {
      alert('Location data is not available for directions.');
      return;
    }

    setIsNavigating(true);
    setNavigationStatus('');

    try {
      // Use enhanced navigation service
      await EnhancedNavigationService.openNavigation(
        effectiveLocation,
        {
          lat: store.lat,
          lng: store.lng,
          name: store.name,
          address: store.location
        },
        (status) => setNavigationStatus(status),
        store
      );

      // Also get route for map display
      const directions = await PerformanceOptimizedMapService.getDirections(
        effectiveLocation,
        { lat: store.lat, lng: store.lng }
      );

      if (directions && directions.routes && directions.routes.length > 0) {
        const route = directions.routes[0];
        if (route.geometry && route.geometry.coordinates) {
          setRouteCoordinates(route.geometry.coordinates);
          setSelectedStore(store);
        }
      }

      // Clear status after success
      setTimeout(() => {
        setNavigationStatus('');
        setIsNavigating(false);
      }, 3000);

    } catch (error) {
      console.error('Enhanced directions error:', error);
      setNavigationStatus(`Error: ${error instanceof Error ? error.message : 'Navigation failed'}`);
      
      // Clear error status after a few seconds
      setTimeout(() => {
        setNavigationStatus('');
        setIsNavigating(false);
      }, 5000);
    }
  };

  const handleSearch = useCallback((query: string) => {
    setIsSearching(true);
    const sanitizedQuery = SecurityUtils.sanitizeSearchQuery(query);
    setSearchQuery(sanitizedQuery);
    
    // Simulate search delay for better UX
    setTimeout(() => {
      setIsSearching(false);
    }, 300);
  }, []);

  const handleLocationSearch = useCallback(async (location: string) => {
    if (!location.trim()) {
      setSearchLocation(undefined);
      setLocationQuery('');
      return;
    }

    try {
      const sanitizedLocation = SecurityUtils.sanitizeText(location, 200);
      setLocationQuery(sanitizedLocation);
      
      const coordinates = await PerformanceOptimizedMapService.geocodeAddress(sanitizedLocation);
      if (coordinates) {
        const validation = LocationService.validateCoordinates(coordinates);
        if (validation.isValid) {
          setSearchLocation(validation.coordinates);
        } else {
          alert('Invalid location coordinates received.');
        }
      } else {
        alert('Location not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Enhanced location search error:', error);
      alert('Error searching for location. Please try again.');
    }
  }, []);

  const handleFiltersChange = (newFilters: StoreFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const getActiveFiltersCount = () => {
    return filters.hours.length + (filters.distance ? 1 : 0);
  };

  const handleRetryLocation = () => {
    getCurrentLocation();
  };

  const handleRefreshData = () => {
    loadStoresData();
    getCurrentLocation();
  };

  const getNavigationStatusIcon = () => {
    if (isNavigating) {
      return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
    }
    if (navigationStatus.startsWith('Error:')) {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    if (navigationStatus.startsWith('Opened in') || navigationStatus.startsWith('Welcome back')) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="clean-glass-strong rounded-2xl p-8 text-center max-w-md w-full">
          <div className="gentle-float mb-6">
            <img 
              src="/image.png" 
              alt="GudGum Logo" 
              className="w-16 h-16 mx-auto rounded-xl shadow-sm"
            />
          </div>
          <LoadingSpinner message="Loading enhanced store locator..." />
          <p className="text-body mt-4">Initializing performance optimizations...</p>
          
          {performanceStats && (
            <div className="mt-4 text-xs text-muted">
              <p>Cache: {performanceStats.geocodeCache.size} locations</p>
              <p>API calls: {performanceStats.apiUsage.geocodingCalls}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="clean-glass-strong rounded-2xl p-8 text-center max-w-md w-full">
          <img 
            src="/image.png" 
            alt="GudGum Logo" 
            className="w-12 h-12 mx-auto rounded-xl shadow-sm mb-6"
          />
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-heading mb-2">Service Error</h2>
          <p className="text-body mb-6">{error}</p>
          
          <div className="space-y-3">
            <button
              onClick={loadStoresData}
              className="custom-button-primary px-6 py-3 rounded-xl font-semibold w-full"
            >
              Retry Loading
            </button>
            
            <button
              onClick={() => {
                LocationService.clearCache();
                PerformanceOptimizedMapService.clearAllCaches();
                window.location.reload();
              }}
              className="clean-button px-6 py-3 rounded-xl font-semibold w-full"
            >
              Clear Cache & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Enhanced Header with Performance Indicators */}
      <header className="clean-header sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-4">
            <div className="gentle-float">
              <img 
                src="/image.png" 
                alt="GudGum Logo" 
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl shadow-sm"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold contrast-text">
                Enhanced Store Locator
              </h1>
              <p className="contrast-text-light text-sm sm:text-base mt-1">
                Find GudGum stores with intelligent navigation & real-time updates
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Activity className="w-4 h-4 text-green-500" />
                <span>{filteredStores.length} stores</span>
              </div>
              {performanceStats && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <span>Cache: {performanceStats.geocodeCache.size}</span>
                </div>
              )}
              <button
                onClick={handleRefreshData}
                className="clean-button p-2 rounded-lg mobile-touch"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Enhanced Status Cards */}
        {locationLoading && (
          <div className="clean-glass rounded-xl p-4 sm:p-6 fade-in">
            <div className="flex items-center gap-3">
              <div className="gentle-pulse">
                <MapPinIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-heading font-semibold">Getting your precise location...</p>
                <p className="text-body text-sm">Using high-accuracy GPS for better results</p>
              </div>
            </div>
          </div>
        )}

        {locationError && (
          <div className="status-warning clean-glass rounded-xl p-4 sm:p-6 fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPinIcon className="w-5 h-5" />
                <div>
                  <p className="font-semibold">Enhanced Location Service Issue</p>
                  <p className="text-sm">{locationError}</p>
                </div>
              </div>
              <button
                onClick={handleRetryLocation}
                className="clean-button px-4 py-2 rounded-lg text-sm font-medium mobile-touch"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {userLocation && (
          <div className="status-success clean-glass rounded-xl p-4 sm:p-6 fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5" />
              <div>
                <p className="font-semibold">High-precision location detected</p>
                <p className="text-sm opacity-90">
                  Real-time distance updates enabled • Accuracy: ±{LocationService.getCacheStats().entries[0]?.accuracy || 'Unknown'}m
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Status */}
        {navigationStatus && (
          <div className={`rounded-xl p-4 sm:p-6 fade-in clean-glass ${navigationStatus.startsWith('Error:') ? 'status-error' : navigationStatus.startsWith('Opened in') || navigationStatus.startsWith('Welcome back') ? 'status-success' : 'status-info'}`}>
            <div className="flex items-center gap-3">
              {getNavigationStatusIcon()}
              <div>
                <p className="font-semibold">Enhanced Navigation Status</p>
                <p className="text-sm">{navigationStatus}</p>
              </div>
            </div>
          </div>
        )}

        {/* Performance Stats (Development Mode) */}
        {process.env.NODE_ENV === 'development' && performanceStats && (
          <div className="clean-glass rounded-xl p-4 sm:p-6 fade-in">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-heading">Performance Stats</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted">Geocode Cache</p>
                <p className="font-semibold">{performanceStats.geocodeCache.size}</p>
              </div>
              <div>
                <p className="text-muted">API Calls</p>
                <p className="font-semibold">{performanceStats.apiUsage.geocodingCalls}</p>
              </div>
              <div>
                <p className="text-muted">Queue Size</p>
                <p className="font-semibold">{performanceStats.queueSize}</p>
              </div>
              <div>
                <p className="text-muted">Remaining</p>
                <p className="font-semibold">{performanceStats.apiUsage.remainingCalls}</p>
              </div>
            </div>
            
            {/* Distance Validation Results */}
            {distanceValidationResults.size > 0 && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <h4 className="font-semibold text-sm mb-2">Distance Validation</h4>
                <div className="space-y-2 text-xs">
                  {Array.from(distanceValidationResults.entries()).map(([storeId, validation]) => (
                    <div key={storeId} className="flex justify-between">
                      <span>Store {storeId.slice(-4)}</span>
                      <span className={validation.accuracy === 'high' ? 'text-green-600' : validation.accuracy === 'medium' ? 'text-yellow-600' : 'text-red-600'}>
                        {validation.accuracy || 'Error'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search and Filters */}
        <div className="space-y-4">
          <SearchBox
            onSearch={handleSearch}
            onLocationSearch={handleLocationSearch}
            currentLocation={locationQuery}
            isSearching={isSearching}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            activeFiltersCount={getActiveFiltersCount()}
          />

          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            isVisible={showFilters}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
          {/* Map Section */}
          <div className="order-2 xl:order-1">
            <div className="clean-glass rounded-2xl p-4 sm:p-6 h-full">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-semibold text-heading">Interactive Map</h2>
                {filteredStores.length > 0 && (
                  <span className="clean-button px-3 py-1 rounded-full text-sm">
                    {filteredStores.length} stores
                  </span>
                )}
              </div>
              
              <div className="rounded-xl overflow-hidden">
                <MapContainer
                  stores={filteredStores}
                  selectedStore={selectedStore}
                  userLocation={effectiveLocation}
                  onStoreSelect={handleStoreSelect}
                  routeCoordinates={routeCoordinates}
                />
              </div>
            </div>
          </div>

          {/* Store List Section */}
          <div className="order-1 xl:order-2">
            <div className="clean-glass rounded-2xl p-4 sm:p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <StoreIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-lg sm:text-xl font-semibold text-heading">
                    {searchQuery ? 'Search Results' : effectiveLocation ? 'Nearby Stores' : 'All Stores'}
                  </h2>
                </div>
                
                {filteredStores.length > 0 && (
                  <div className="text-sm text-muted hidden sm:block">
                    Sorted by {filters.sortBy}
                  </div>
                )}
              </div>

              {filteredStores.length === 0 ? (
                <div className="text-center py-12">
                  <div className="gentle-float mb-4">
                    <StoreIcon className="w-12 h-12 text-slate-400 mx-auto" />
                  </div>
                  <p className="text-body mb-2 font-medium">
                    {searchQuery ? 'No stores match your search' : 'No stores found'}
                  </p>
                  <p className="text-sm text-muted">
                    {searchQuery || getActiveFiltersCount() > 0 
                      ? 'Try adjusting your search or filters' 
                      : 'Try adjusting your location'
                    }
                  </p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                  <div className="space-y-4">
                    {filteredStores.slice(0, 6).map((store, index) => (
                      <div
                        key={store.id}
                        className="scale-in"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <EnhancedStoreCard
                          store={store}
                          onGetDirections={handleGetDirections}
                          onSelectStore={handleStoreSelect}
                          isSelected={selectedStore?.id === store.id}
                          userLocation={effectiveLocation}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {filteredStores.length > 6 && (
                    <div className="text-center mt-6">
                      <p className="text-sm text-muted">
                        Showing 6 of {filteredStores.length} stores
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Selected Store Details */}
        {selectedStore && (
          <div className="clean-glass-strong rounded-2xl p-6 slide-up">
            <div className="flex items-center gap-2 mb-6">
              <Navigation className="w-5 h-5 text-[#3f805a]" />
              <h3 className="text-xl font-semibold text-heading">Selected Store Details</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-lg text-heading">{selectedStore.name}</h4>
                <p className="text-body">{selectedStore.location}</p>
                {selectedStore.hours && (
                  <p className="text-body">{selectedStore.hours}</p>
                )}
                {selectedStore.phone && (
                  <p className="text-body">{selectedStore.phone}</p>
                )}
                {selectedStore.distance && (
                  <p className="text-primary font-semibold">
                    {LocationService.formatDistance(selectedStore.distance).formatted} away
                  </p>
                )}
                
                {/* Device Capabilities */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-muted mb-2">Navigation Options:</p>
                  <div className="text-xs text-muted space-y-1">
                    <p>Device: {EnhancedNavigationService.getDeviceCapabilities().platform}</p>
                    <p>Mobile: {EnhancedNavigationService.getDeviceCapabilities().isMobile ? 'Yes' : 'No'}</p>
                    <p>Maps App: {EnhancedNavigationService.getDeviceCapabilities().hasGoogleMaps ? 'Available' : 'Web Only'}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-end">
                <button
                  onClick={() => handleGetDirections(selectedStore)}
                  disabled={isNavigating}
                  className={`px-8 py-4 rounded-xl transition-all duration-300 flex items-center gap-3 font-semibold text-lg mobile-touch focus-ring ${
                    isNavigating
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : 'custom-button-primary hover:shadow-md'
                  }`}
                >
                  {isNavigating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Navigation className="w-5 h-5" />
                  )}
                  {isNavigating ? 'Opening...' : 'Get Enhanced Directions'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};