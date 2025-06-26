import React, { useState, useCallback, useEffect } from 'react';
import { Store } from '../types/store';
import { MapPin, Clock, Phone, Navigation, Loader2, CheckCircle, AlertCircle, Star, ExternalLink } from 'lucide-react';
import { EnhancedNavigationService } from '../services/enhancedNavigationService';
import { LocationService } from '../services/locationService';
import { SecurityUtils } from '../utils/securityUtils';

interface EnhancedStoreCardProps {
  store: Store;
  onGetDirections: (store: Store) => void;
  onSelectStore: (store: Store) => void;
  isSelected?: boolean;
  userLocation?: { lat: number; lng: number };
}

export const EnhancedStoreCard: React.FC<EnhancedStoreCardProps> = ({ 
  store, 
  onGetDirections, 
  onSelectStore,
  isSelected = false,
  userLocation
}) => {
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [lastNavigationAttempt, setLastNavigationAttempt] = useState<number>(0);
  const [distanceValidation, setDistanceValidation] = useState<{
    calculated: number;
    google?: number;
    accuracy: 'high' | 'medium' | 'low';
  } | null>(null);

  // Validate distance calculation on mount and when dependencies change
  useEffect(() => {
    if (userLocation && store.lat && store.lng && store.distance) {
      const validateDistance = async () => {
        try {
          const validation = await LocationService.validateDistanceWithGoogleMaps(
            userLocation,
            { lat: store.lat!, lng: store.lng! }
          );
          setDistanceValidation(validation);
        } catch (error) {
          console.warn('Distance validation failed:', error);
        }
      };

      validateDistance();
    }
  }, [userLocation, store.lat, store.lng, store.distance]);

  // Listen for navigation return events
  useEffect(() => {
    const handleNavigationReturn = (event: CustomEvent) => {
      console.log('Navigation return detected:', event.detail);
      setNavigationStatus('Welcome back! Navigation completed.');
      setIsNavigating(false);
      
      // Clear status after a few seconds
      setTimeout(() => {
        setNavigationStatus('');
      }, 3000);
    };

    window.addEventListener('navigationReturn', handleNavigationReturn as EventListener);
    
    return () => {
      window.removeEventListener('navigationReturn', handleNavigationReturn as EventListener);
    };
  }, []);

  const handleDirectionsClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Rate limiting check
    const now = Date.now();
    if (now - lastNavigationAttempt < 2000) {
      setNavigationStatus('Please wait before trying again');
      return;
    }
    setLastNavigationAttempt(now);

    // Validate store coordinates
    if (!store.lat || !store.lng) {
      setNavigationStatus('Error: Store location not available');
      return;
    }

    const coordinateValidation = LocationService.validateCoordinates({
      lat: store.lat,
      lng: store.lng
    });

    if (!coordinateValidation.isValid) {
      setNavigationStatus(`Error: ${coordinateValidation.error}`);
      return;
    }

    setIsNavigating(true);
    setNavigationStatus('Preparing navigation...');

    try {
      // Get current location if not provided
      const currentLocation = userLocation || await LocationService.getCurrentLocationWithFallback();

      // Sanitize destination data
      const sanitizedDestination = SecurityUtils.sanitizeLocationParams({
        lat: store.lat,
        lng: store.lng,
        name: store.name,
        address: store.location
      });

      if (!sanitizedDestination.lat || !sanitizedDestination.lng) {
        throw new Error('Invalid destination coordinates');
      }

      // Use enhanced navigation service with session state management
      const result = await EnhancedNavigationService.openNavigation(
        currentLocation,
        {
          lat: sanitizedDestination.lat,
          lng: sanitizedDestination.lng,
          name: sanitizedDestination.name,
          address: sanitizedDestination.address
        },
        (status) => setNavigationStatus(status),
        store // Pass store for session state
      );

      if (result.success) {
        const methodText = {
          'app': 'Navigation App',
          'web': 'Google Maps (Web)',
          'fallback': 'Browser Maps'
        }[result.method];
        
        setNavigationStatus(`Opened in ${methodText}`);
        
        // Also trigger the original directions handler for map route display
        onGetDirections(store);
      } else {
        throw new Error(result.error || 'Navigation failed');
      }

      // Clear status after success
      setTimeout(() => {
        if (!navigationStatus.includes('Welcome back')) {
          setNavigationStatus('');
          setIsNavigating(false);
        }
      }, 3000);
      
    } catch (error) {
      console.error('Enhanced navigation error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Navigation failed';
      setNavigationStatus(`Error: ${errorMessage}`);
      
      // Log security event for monitoring
      SecurityUtils.logSecurityEvent({
        type: 'invalid_input',
        details: `Navigation failed for store ${store.id}: ${errorMessage}`
      });
      
      // Clear error status after a few seconds
      setTimeout(() => {
        setNavigationStatus('');
        setIsNavigating(false);
      }, 5000);
    }
  }, [store, userLocation, onGetDirections, lastNavigationAttempt, navigationStatus]);

  const getStatusIcon = () => {
    if (isNavigating) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (navigationStatus.startsWith('Error:')) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (navigationStatus.startsWith('Opened in') || navigationStatus.startsWith('Welcome back')) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <Navigation className="w-4 h-4" />;
  };

  const getStatusColor = () => {
    if (navigationStatus.startsWith('Error:')) {
      return 'status-error';
    }
    if (navigationStatus.startsWith('Opened in') || navigationStatus.startsWith('Welcome back')) {
      return 'status-success';
    }
    if (navigationStatus.includes('wait')) {
      return 'status-warning';
    }
    return 'status-info';
  };

  // Generate mock rating for demonstration
  const rating = (store as any).rating || (4.0 + Math.random());

  // Calculate distance display with validation
  const getDistanceDisplay = () => {
    if (store.distance) {
      const formatted = LocationService.formatDistance(store.distance, 'km');
      return `${formatted.formatted} away`;
    }
    
    if (userLocation && store.lat && store.lng) {
      const distance = LocationService.calculateDistance(
        userLocation.lat, 
        userLocation.lng, 
        store.lat, 
        store.lng
      );
      
      if (isFinite(distance)) {
        const formatted = LocationService.formatDistance(distance, 'km');
        return `${formatted.formatted} away`;
      }
    }
    
    return null;
  };

  const distanceDisplay = getDistanceDisplay();

  // Sanitize store data for display
  const sanitizedStore = {
    name: SecurityUtils.sanitizeText(store.name, 100),
    location: SecurityUtils.sanitizeText(store.location, 200),
    hours: store.hours ? SecurityUtils.sanitizeText(store.hours, 100) : null,
    phone: store.phone ? SecurityUtils.sanitizeText(store.phone, 20) : null
  };

  return (
    <div 
      className={`clean-glass rounded-2xl transition-all duration-300 cursor-pointer mobile-touch ${
        isSelected 
          ? 'ring-2 ring-blue-400/50 bg-blue-50/30 scale-[1.02]' 
          : 'hover:scale-[1.01] hover:shadow-md'
      }`}
      onClick={() => onSelectStore(store)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectStore(store);
        }
      }}
      aria-label={`Select ${sanitizedStore.name} store`}
    >
      {store.image && (
        <div className="h-48 bg-gradient-to-br from-blue-50/50 to-slate-100/50 rounded-t-2xl overflow-hidden relative">
          <img 
            src={SecurityUtils.sanitizeUrl(store.image)} 
            alt={`${sanitizedStore.name} store`}
            className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              // Hide image on error
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
        </div>
      )}
      
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-heading leading-tight">
            {sanitizedStore.name}
          </h3>
          <div className="flex items-center gap-1 clean-button px-2 py-1 rounded-lg">
            <Star className="w-4 h-4 text-amber-500 fill-current" />
            <span className="text-sm font-medium">{rating.toFixed(1)}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start text-body">
            <MapPin className="w-4 h-4 mt-1 mr-3 text-primary flex-shrink-0" />
            <p className="text-sm leading-relaxed">{sanitizedStore.location}</p>
          </div>
          
          {sanitizedStore.hours && (
            <div className="flex items-center text-body">
              <Clock className="w-4 h-4 mr-3 text-primary flex-shrink-0" />
              <p className="text-sm">{sanitizedStore.hours}</p>
            </div>
          )}
          
          {sanitizedStore.phone && (
            <div className="flex items-center text-body">
              <Phone className="w-4 h-4 mr-3 text-primary flex-shrink-0" />
              <a 
                href={`tel:${sanitizedStore.phone}`}
                className="text-sm hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {sanitizedStore.phone}
              </a>
            </div>
          )}
          
          {distanceDisplay && (
            <div className="space-y-2">
              <div className="clean-button inline-flex items-center px-3 py-2 rounded-xl">
                <span className="text-sm font-semibold text-primary">
                  {distanceDisplay}
                </span>
              </div>
              
              {/* Distance validation indicator */}
              {distanceValidation && process.env.NODE_ENV === 'development' && (
                <div className="text-xs text-muted bg-slate-100/50 p-2 rounded-lg">
                  <p>Calculated: {distanceValidation.calculated.toFixed(2)} km</p>
                  {distanceValidation.google && (
                    <p>Est. Road: {distanceValidation.google.toFixed(2)} km</p>
                  )}
                  <p>Accuracy: {distanceValidation.accuracy}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="space-y-3 pt-2">
          <button
            onClick={handleDirectionsClick}
            disabled={isNavigating}
            className={`w-full py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-3 text-sm font-semibold mobile-touch focus-ring ${
              isNavigating
                ? 'bg-slate-400 text-white cursor-not-allowed'
                : 'custom-button-primary hover:shadow-md'
            }`}
            aria-label={`Get directions to ${sanitizedStore.name}`}
          >
            {getStatusIcon()}
            {isNavigating ? 'Opening Navigation...' : 'Get Directions'}
            <ExternalLink className="w-4 h-4 ml-1" />
          </button>
          
          {/* Enhanced Status Message */}
          {navigationStatus && (
            <div className={`text-xs text-center p-3 rounded-xl transition-all duration-300 ${getStatusColor()}`}>
              <div className="flex items-center justify-center gap-2">
                {getStatusIcon()}
                <span>{navigationStatus}</span>
              </div>
              
              {navigationStatus.startsWith('Error:') && (
                <div className="mt-2 text-xs opacity-75">
                  <p>Troubleshooting tips:</p>
                  <ul className="text-left mt-1 space-y-1">
                    <li>• Check your internet connection</li>
                    <li>• Enable location services</li>
                    <li>• Try refreshing the page</li>
                  </ul>
                </div>
              )}
              
              {navigationStatus.startsWith('Welcome back') && (
                <div className="mt-2 text-xs opacity-75">
                  <p>Your session has been restored</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Device Capabilities Info (for debugging) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-muted bg-slate-100/50 p-2 rounded-lg">
            <p>Device: {EnhancedNavigationService.getDeviceCapabilities().platform}</p>
            <p>Mobile: {EnhancedNavigationService.getDeviceCapabilities().isMobile ? 'Yes' : 'No'}</p>
            <p>Coordinates: {store.lat?.toFixed(4)}, {store.lng?.toFixed(4)}</p>
          </div>
        )}
      </div>
    </div>
  );
};