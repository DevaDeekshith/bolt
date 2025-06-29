import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store, UserLocation } from '../types/store';
import { StoreFilters } from '../types/filters';
import { fetchStores, subscribeToStoreUpdates, transformStoreData, runDatabaseDiagnostics, quickSetup } from '../services/supabase';
import { olaMapService } from '../services/olaMapService';
import { NavigationService } from '../utils/navigationUtils';
import { StoreList } from './StoreList';
import { SearchBox } from './SearchBox';
import { FilterPanel } from './FilterPanel';
import { MapContainer } from './MapContainer';
import { LoadingSpinner } from './LoadingSpinner';
import { MapPin, Store as StoreIcon, Navigation, AlertCircle, MapPinIcon, Loader2, CheckCircle, Database, Settings, RefreshCw } from 'lucide-react';

const DEFAULT_FILTERS: StoreFilters = {
  hours: [],
  distance: null,
  sortBy: 'distance'
};

export const StoreLocator: React.FC = () => {
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
  const [databaseStatus, setDatabaseStatus] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Define helper functions before they are used
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
        // Mock implementation - in real app, this would check actual store hours
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

  // Process store data with coordinates
  const processStoreWithCoordinates = useCallback(async (rawStore: any): Promise<Store | null> => {
    try {
      const transformedStore = transformStoreData(rawStore);
      const coordinates = await olaMapService.geocodeAddress(transformedStore.location);
      
      if (coordinates) {
        return {
          ...transformedStore,
          lat: coordinates.lat,
          lng: coordinates.lng
        };
      }
      
      console.warn('Could not geocode store location:', transformedStore.location);
      return null;
    } catch (error) {
      console.error('Error processing store:', error);
      return null;
    }
  }, []);

  // Real-time event handlers
  const handleStoreInsert = useCallback(async (payload: any) => {
    console.log('Handling store insert:', payload);
    const newStore = await processStoreWithCoordinates(payload.new);
    
    if (newStore) {
      setStores(prevStores => {
        // Check if store already exists to avoid duplicates
        const exists = prevStores.some(store => 
          store.name === newStore.name && store.location === newStore.location
        );
        if (exists) {
          return prevStores;
        }
        return [...prevStores, newStore];
      });
    }
  }, [processStoreWithCoordinates]);

  const handleStoreUpdate = useCallback(async (payload: any) => {
    console.log('Handling store update:', payload);
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
    console.log('Handling store delete:', payload);
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

  // Initialize database connection
  useEffect(() => {
    const initializeDatabase = async () => {
      console.log('🚀 Initializing database connection...');
      setDatabaseStatus({ status: 'connecting', message: 'Connecting to database...' });
      
      try {
        const setupResult = await quickSetup();
        
        if (setupResult.success) {
          setDatabaseStatus({ 
            status: 'connected', 
            message: setupResult.testDataAdded 
              ? `Connected successfully! Added ${setupResult.testDataAdded ? 'test' : ''} data.`
              : `Connected successfully! Found ${setupResult.rowCount || 0} stores.`,
            details: setupResult
          });
        } else {
          setDatabaseStatus({ 
            status: 'error', 
            message: `Connection failed: ${setupResult.error}`,
            details: setupResult
          });
        }
      } catch (error) {
        setDatabaseStatus({ 
          status: 'error', 
          message: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error
        });
      }
    };

    initializeDatabase();
  }, []);

  // Load stores data
  useEffect(() => {
    loadStoresData();
    getCurrentLocation();
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    console.log('Setting up real-time subscription...');
    
    const unsubscribe = subscribeToStoreUpdates(
      handleStoreInsert,
      handleStoreUpdate,
      handleStoreDelete
    );

    return () => {
      unsubscribe();
    };
  }, [handleStoreInsert, handleStoreUpdate, handleStoreDelete]);

  // Filter and sort stores when dependencies change
  const effectiveLocation = searchLocation || userLocation;
  
  const processedStores = useMemo(() => {
    let processed = [...stores];

    // Add distances if we have a reference location
    if (effectiveLocation) {
      processed = processed.map(store => ({
        ...store,
        distance: store.lat && store.lng ? 
          olaMapService.calculateDistance(effectiveLocation.lat, effectiveLocation.lng, store.lat, store.lng) : 
          undefined
      }));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      processed = processed.filter(store =>
        store.name.toLowerCase().includes(query) ||
        store.location.toLowerCase().includes(query)
      );
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
      
      console.log('📊 Loading stores data...');
      const storesData = await fetchStores();
      
      if (!storesData || storesData.length === 0) {
        setError('No store data found. The database might be empty.');
        setDatabaseStatus(prev => ({ 
          ...prev, 
          status: 'warning', 
          message: 'Database is empty - no stores found' 
        }));
        return;
      }
      
      console.log('🔄 Processing stores with coordinates...');
      const storesWithCoordinates = await Promise.all(
        storesData.map(async (store: any) => {
          return await processStoreWithCoordinates(store);
        })
      );

      const validStores = storesWithCoordinates.filter((store): store is Store => store !== null);
      setStores(validStores);
      
      if (validStores.length === 0) {
        setError('No stores with valid locations found.');
      } else {
        console.log(`✅ Successfully loaded ${validStores.length} stores`);
        setDatabaseStatus(prev => ({ 
          ...prev, 
          status: 'connected', 
          message: `Successfully loaded ${validStores.length} stores` 
        }));
      }
    } catch (error) {
      console.error('❌ Error loading stores:', error);
      setError(`Failed to load store data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setDatabaseStatus(prev => ({ 
        ...prev, 
        status: 'error', 
        message: `Failed to load stores: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }));
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        setLocationLoading(false);
        
        // Reverse geocode to get location name
        reverseGeocode(location);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setLocationLoading(false);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location services.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred while retrieving location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 300000
      }
    );
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
      // Use the NavigationService for better device-specific handling
      await NavigationService.handleNavigation(
        {
          lat: store.lat,
          lng: store.lng,
          name: store.name
        },
        effectiveLocation,
        (status) => setNavigationStatus(status)
      );

      // Also get route for map display
      const directions = await olaMapService.getDirections(
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
      console.error('Directions error:', error);
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
    setSearchQuery(query);
    
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
      setLocationQuery(location);
      const coordinates = await olaMapService.geocodeAddress(location);
      if (coordinates) {
        setSearchLocation(coordinates);
      } else {
        alert('Location not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Location search error:', error);
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

  const handleRunDiagnostics = async () => {
    setShowDiagnostics(true);
    try {
      const diagnostics = await runDatabaseDiagnostics();
      setDatabaseStatus(prev => ({ 
        ...prev, 
        diagnostics,
        lastDiagnosticRun: Date.now()
      }));
    } catch (error) {
      console.error('Diagnostics failed:', error);
    }
  };

  const getNavigationStatusIcon = () => {
    if (isNavigating) {
      return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
    }
    if (navigationStatus.startsWith('Error:')) {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    if (navigationStatus.startsWith('Opened in')) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
    return null;
  };

  const getDatabaseStatusIcon = () => {
    switch (databaseStatus?.status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'connecting':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Database className="w-5 h-5 text-gray-600" />;
    }
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
          <LoadingSpinner message="Connecting to database..." />
          <p className="text-body mt-4">Setting up your store locator</p>
          
          {databaseStatus && (
            <div className="mt-4 p-3 clean-glass rounded-xl">
              <div className="flex items-center gap-2 justify-center">
                {getDatabaseStatusIcon()}
                <span className="text-sm">{databaseStatus.message}</span>
              </div>
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
          <h2 className="text-xl font-semibold text-heading mb-2">Database Connection Issue</h2>
          <p className="text-body mb-6">{error}</p>
          
          {databaseStatus && (
            <div className="mb-6 p-3 clean-glass rounded-xl">
              <div className="flex items-center gap-2 justify-center mb-2">
                {getDatabaseStatusIcon()}
                <span className="text-sm font-medium">Database Status</span>
              </div>
              <p className="text-xs text-muted">{databaseStatus.message}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <button
              onClick={loadStoresData}
              className="custom-button-primary px-6 py-3 rounded-xl font-semibold w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Connection
            </button>
            
            <button
              onClick={handleRunDiagnostics}
              className="clean-button px-6 py-3 rounded-xl font-semibold w-full flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Run Diagnostics
            </button>
          </div>
          
          {showDiagnostics && databaseStatus?.diagnostics && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
              <h3 className="font-semibold mb-2">Database Diagnostics</h3>
              <div className="text-xs space-y-2">
                <div>
                  <strong>Connection:</strong> {databaseStatus.diagnostics.connection?.success ? '✅' : '❌'}
                </div>
                <div>
                  <strong>Table Access:</strong> {databaseStatus.diagnostics.tableAccess?.success ? '✅' : '❌'}
                </div>
                <div>
                  <strong>Data Count:</strong> {databaseStatus.diagnostics.dataCount?.count || 0}
                </div>
                {databaseStatus.diagnostics.recommendations?.length > 0 && (
                  <div>
                    <strong>Recommendations:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {databaseStatus.diagnostics.recommendations.map((rec: string, idx: number) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
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
                GudGum Store Locator
              </h1>
              <p className="contrast-text-light text-sm sm:text-base mt-1">
                Find GudGum stores near you with smart navigation
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <StoreIcon className="w-4 h-4" />
                <span>{filteredStores.length} stores</span>
              </div>
              {databaseStatus && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  {getDatabaseStatusIcon()}
                  <span className="hidden lg:inline">{databaseStatus.status}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Database Status Card */}
        {databaseStatus && (
          <div className={`clean-glass rounded-xl p-4 sm:p-6 fade-in ${
            databaseStatus.status === 'error' ? 'status-error' : 
            databaseStatus.status === 'warning' ? 'status-warning' : 
            databaseStatus.status === 'connected' ? 'status-success' : 'status-info'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getDatabaseStatusIcon()}
                <div>
                  <p className="font-semibold">Database Connection</p>
                  <p className="text-sm">{databaseStatus.message}</p>
                </div>
              </div>
              <button
                onClick={handleRunDiagnostics}
                className="clean-button px-4 py-2 rounded-lg text-sm font-medium mobile-touch"
              >
                <Settings className="w-4 h-4 mr-2" />
                Diagnose
              </button>
            </div>
          </div>
        )}

        {/* Location Status Cards */}
        {locationLoading && (
          <div className="clean-glass rounded-xl p-4 sm:p-6 fade-in">
            <div className="flex items-center gap-3">
              <div className="gentle-pulse">
                <MapPinIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-heading font-semibold">Getting your location...</p>
                <p className="text-body text-sm">This helps us show you the nearest stores</p>
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
                  <p className="font-semibold">Location Access Issue</p>
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
                <p className="font-semibold">Location detected successfully</p>
                <p className="text-sm opacity-90">
                  Showing stores sorted by distance from your location
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Status */}
        {navigationStatus && (
          <div className={`rounded-xl p-4 sm:p-6 fade-in clean-glass ${navigationStatus.startsWith('Error:') ? 'status-error' : navigationStatus.startsWith('Opened in') ? 'status-success' : 'status-info'}`}>
            <div className="flex items-center gap-3">
              {getNavigationStatusIcon()}
              <div>
                <p className="font-semibold">Navigation Status</p>
                <p className="text-sm">{navigationStatus}</p>
              </div>
            </div>
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
                <h2 className="text-lg sm:text-xl font-semibold text-heading">Store Map</h2>
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
                  <p className="text-sm text-muted mb-4">
                    {searchQuery || getActiveFiltersCount() > 0 
                      ? 'Try adjusting your search or filters' 
                      : 'Check your database connection'
                    }
                  </p>
                  
                  {!searchQuery && getActiveFiltersCount() === 0 && (
                    <div className="space-y-2">
                      <button
                        onClick={loadStoresData}
                        className="clean-button px-4 py-2 rounded-lg text-sm font-medium mobile-touch"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Data
                      </button>
                      <button
                        onClick={handleRunDiagnostics}
                        className="clean-button px-4 py-2 rounded-lg text-sm font-medium mobile-touch"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Check Database
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                  <StoreList
                    stores={filteredStores}
                    selectedStore={selectedStore}
                    onStoreSelect={handleStoreSelect}
                    onGetDirections={handleGetDirections}
                    userLocation={effectiveLocation}
                    isLoading={isSearching}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected Store Details */}
        {selectedStore && (
          <div className="clean-glass-strong rounded-2xl p-6 slide-up">
            <div className="flex items-center gap-2 mb-6">
              <Navigation className="w-5 h-5 text-[#3f805a]" />
              <h3 className="text-xl font-semibold text-heading">Selected Store</h3>
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
                    {selectedStore.distance.toFixed(1)} km away
                  </p>
                )}
              </div>
              
              <div className="flex items-center justify-end">
                <button
                  onClick={() => handleGetDirections(selectedStore)}
                  disabled={isNavigating}
                  className={`px-8 py-4 rounded-xl transition-all duration-300 flex items-center gap-3 font-semibold text-lg mobile-touch ${
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
                  {isNavigating ? 'Opening...' : 'Get Directions'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostics Modal */}
        {showDiagnostics && databaseStatus?.diagnostics && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="clean-glass-strong rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-heading">Database Diagnostics</h3>
                <button
                  onClick={() => setShowDiagnostics(false)}
                  className="clean-button p-2 rounded-lg"
                >
                  ×
                </button>
              </div>
              <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto">
                {JSON.stringify(databaseStatus.diagnostics, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};