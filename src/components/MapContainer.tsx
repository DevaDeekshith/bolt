import React, { useEffect, useRef, useState } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Store, UserLocation } from '../types/store';
import { Loader2, MapPin, AlertCircle, RefreshCw, Clock, Phone } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface MapContainerProps {
  stores: Store[];
  selectedStore?: Store;
  userLocation?: UserLocation;
  onStoreSelect: (store: Store) => void;
  routeCoordinates?: Array<[number, number]>;
}

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom store marker icon using GudGum logo
const createStoreIcon = (isSelected: boolean) => {
  return L.divIcon({
    html: `
      <div style="
        width: 44px;
        height: 44px;
        background-image: url('/image.png');
        background-size: cover;
        background-position: center;
        border-radius: 50%;
        border: 3px solid ${isSelected ? '#3b82f6' : '#ffffff'};
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        transform: scale(${isSelected ? '1.2' : '1'});
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      ">
        ${isSelected ? '<div style="position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: #3b82f6; border-radius: 50%; border: 2px solid white;"></div>' : ''}
      </div>
    `,
    className: 'custom-marker',
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44]
  });
};

// Enhanced user location marker icon with clean design
const userLocationIcon = L.divIcon({
  html: `
    <div style="
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
      "></div>
    </div>
  `,
  className: 'user-location-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Component to handle map events and updates
const MapController: React.FC<{
  selectedStore?: Store;
  userLocation?: UserLocation;
  routeCoordinates?: Array<[number, number]>;
}> = ({ selectedStore, userLocation, routeCoordinates }) => {
  const map = useMap();
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Handle selected store changes
  useEffect(() => {
    if (selectedStore && selectedStore.lat && selectedStore.lng) {
      map.flyTo([selectedStore.lat, selectedStore.lng], 16, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [map, selectedStore]);

  // Handle route display
  useEffect(() => {
    // Remove existing route
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    // Add new route if coordinates exist
    if (routeCoordinates && routeCoordinates.length > 0) {
      const latLngCoordinates = routeCoordinates.map(coord => [coord[1], coord[0]] as [number, number]);
      
      routeLayerRef.current = L.polyline(latLngCoordinates, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 4',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }

    return () => {
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
      }
    };
  }, [map, routeCoordinates]);

  // Handle user location changes
  useEffect(() => {
    if (userLocation) {
      // Optionally center on user location when first obtained
      map.setView([userLocation.lat, userLocation.lng], 13);
    }
  }, [map, userLocation]);

  return null;
};

export const MapContainer: React.FC<MapContainerProps> = ({
  stores,
  selectedStore,
  userLocation,
  onStoreSelect,
  routeCoordinates
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Default center (Bangalore, India)
  const defaultCenter: [number, number] = [12.931423492103944, 77.61648476788898];
  
  // Use user location or selected store as center, fallback to default
  const mapCenter: [number, number] = 
    selectedStore && selectedStore.lat && selectedStore.lng 
      ? [selectedStore.lat, selectedStore.lng]
      : userLocation 
        ? [userLocation.lat, userLocation.lng]
        : defaultCenter;

  const handleMapLoad = () => {
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
  };

  const handleMapError = (errorMessage: string) => {
    setError(errorMessage);
    setIsLoading(false);
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setIsLoading(true);
    
    // Force re-render by updating key
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  const handleHardRefresh = () => {
    window.location.reload();
  };

  if (error) {
    return (
      <div className="h-96 clean-glass rounded-xl flex items-center justify-center">
        <div className="text-center max-w-lg px-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-600 mb-2">Map Loading Error</h3>
          <div className="text-muted text-sm leading-relaxed mb-4">
            {error}
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleRetry}
                disabled={isLoading}
                className="clean-button px-4 py-2 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mobile-touch"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Retry {retryCount > 0 && `(${retryCount})`}
              </button>
              
              <button
                onClick={handleHardRefresh}
                className="clean-button px-4 py-2 rounded-xl font-medium mobile-touch"
              >
                Hard Refresh
              </button>
            </div>
            
            <div className="text-xs text-muted mt-3 clean-glass p-3 rounded-xl">
              <p className="mb-2 font-medium">Troubleshooting steps:</p>
              <ul className="text-left space-y-1">
                <li>• Check internet connection</li>
                <li>• Disable browser extensions temporarily</li>
                <li>• Try a different browser</li>
                <li>• Clear browser cache</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-96 clean-glass rounded-xl overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 clean-glass-strong flex items-center justify-center z-[1000]">
          <div className="text-center space-y-4">
            <div className="relative">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            </div>
            <p className="text-body font-medium">Loading interactive map...</p>
            {retryCount > 0 && (
              <p className="text-xs text-muted">Retry attempt {retryCount}</p>
            )}
          </div>
        </div>
      )}

      <LeafletMapContainer
        center={mapCenter}
        zoom={13}
        className="w-full h-full rounded-xl"
        whenReady={handleMapLoad}
        key={`map-${retryCount}`} // Force re-render on retry
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          onLoad={handleMapLoad}
          onError={() => handleMapError('Failed to load map tiles. Please check your internet connection.')}
        />
        
        <MapController 
          selectedStore={selectedStore}
          userLocation={userLocation}
          routeCoordinates={routeCoordinates}
        />

        {/* User location marker */}
        {userLocation && (
          <Marker 
            position={[userLocation.lat, userLocation.lng]} 
            icon={userLocationIcon}
          >
            <Popup className="clean-popup">
              <div className="text-center p-2">
                <div className="flex items-center gap-2 mb-2">
                  <strong className="text-primary">Your Location</strong>
                </div>
                <p className="text-sm text-muted">
                  {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Store markers */}
        {stores.map((store) => {
          if (!store.lat || !store.lng) return null;
          
          return (
            <Marker
              key={store.id}
              position={[store.lat, store.lng]}
              icon={createStoreIcon(selectedStore?.id === store.id)}
              eventHandlers={{
                click: () => onStoreSelect(store),
              }}
            >
              <Popup className="clean-popup">
                <div className="min-w-[220px] p-2">
                  <div className="flex items-center gap-2 mb-3">
                    <img 
                      src="/image.png" 
                      alt="GudGum" 
                      className="w-6 h-6 rounded-lg"
                    />
                    <h3 className="font-bold text-lg text-heading">{store.name}</h3>
                  </div>
                  <div className="space-y-2">
                    <p className="text-body text-sm flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      {store.location}
                    </p>
                    {store.hours && (
                      <p className="text-body text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        {store.hours}
                      </p>
                    )}
                    {store.phone && (
                      <p className="text-body text-sm flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary" />
                        {store.phone}
                      </p>
                    )}
                    {store.distance && (
                      <div className="clean-button inline-flex items-center px-2 py-1 rounded-lg">
                        <span className="text-primary font-semibold text-sm">
                          {store.distance.toFixed(1)} km away
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </LeafletMapContainer>

      {stores.length === 0 && !isLoading && (
        <div className="absolute inset-0 clean-glass-strong flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-body font-medium">No stores found</p>
            <p className="text-sm text-muted mt-1">Try adjusting your search or filters</p>
          </div>
        </div>
      )}
    </div>
  );
};