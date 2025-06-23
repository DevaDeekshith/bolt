import React, { useState } from 'react';
import { Store } from '../types/store';
import { MapPin, Clock, Phone, Navigation, Loader2, CheckCircle, AlertCircle, Star } from 'lucide-react';
import { NavigationService } from '../utils/navigationUtils';

interface StoreCardProps {
  store: Store;
  onGetDirections: (store: Store) => void;
  onSelectStore: (store: Store) => void;
  isSelected?: boolean;
  userLocation?: { lat: number; lng: number };
}

export const StoreCard: React.FC<StoreCardProps> = ({ 
  store, 
  onGetDirections, 
  onSelectStore,
  isSelected = false,
  userLocation
}) => {
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState(false);

  const handleDirectionsClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!store.lat || !store.lng) {
      alert('Store location coordinates are not available.');
      return;
    }

    setIsNavigating(true);
    setNavigationStatus('');

    try {
      await NavigationService.handleNavigation(
        {
          lat: store.lat,
          lng: store.lng,
          name: store.name
        },
        userLocation,
        (status) => setNavigationStatus(status)
      );
      
      // Also trigger the original directions handler for map route display
      onGetDirections(store);
      
      // Clear status after success
      setTimeout(() => {
        setNavigationStatus('');
        setIsNavigating(false);
      }, 3000);
      
    } catch (error) {
      console.error('Directions error:', error);
      
      // Show error for a few seconds then clear
      setTimeout(() => {
        setNavigationStatus('');
        setIsNavigating(false);
      }, 5000);
    }
  };

  const getStatusIcon = () => {
    if (isNavigating) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (navigationStatus.startsWith('Error:')) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (navigationStatus.startsWith('Opened in')) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <Navigation className="w-4 h-4" />;
  };

  const getStatusColor = () => {
    if (navigationStatus.startsWith('Error:')) {
      return 'status-error';
    }
    if (navigationStatus.startsWith('Opened in')) {
      return 'status-success';
    }
    return 'status-info';
  };

  const rating = (store as any).rating || 4.0 + Math.random();

  return (
    <div 
      className={`clean-glass rounded-2xl transition-all duration-300 cursor-pointer mobile-touch ${
        isSelected 
          ? 'ring-2 ring-blue-400/50 bg-blue-50/30 scale-[1.02]' 
          : 'hover:scale-[1.01] hover:shadow-md'
      }`}
      onClick={() => onSelectStore(store)}
    >
      {store.image && (
        <div className="h-48 bg-gradient-to-br from-blue-50/50 to-slate-100/50 rounded-t-2xl overflow-hidden relative">
          <img 
            src={store.image} 
            alt={store.name}
            className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
        </div>
      )}
      
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-heading leading-tight">{store.name}</h3>
          <div className="flex items-center gap-1 clean-button px-2 py-1 rounded-lg">
            <Star className="w-4 h-4 text-amber-500 fill-current" />
            <span className="text-sm font-medium">{rating.toFixed(1)}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start text-body">
            <MapPin className="w-4 h-4 mt-1 mr-3 text-primary flex-shrink-0" />
            <p className="text-sm leading-relaxed">{store.location}</p>
          </div>
          
          {store.hours && (
            <div className="flex items-center text-body">
              <Clock className="w-4 h-4 mr-3 text-primary flex-shrink-0" />
              <p className="text-sm">{store.hours}</p>
            </div>
          )}
          
          {store.phone && (
            <div className="flex items-center text-body">
              <Phone className="w-4 h-4 mr-3 text-primary flex-shrink-0" />
              <p className="text-sm">{store.phone}</p>
            </div>
          )}
          
          {store.distance && (
            <div className="clean-button inline-flex items-center px-3 py-2 rounded-xl">
              <span className="text-sm font-semibold text-primary">
                {store.distance.toFixed(1)} km away
              </span>
            </div>
          )}
        </div>
        
        <div className="space-y-3 pt-2">
          <button
            onClick={handleDirectionsClick}
            disabled={isNavigating}
            className={`w-full py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-3 text-sm font-semibold mobile-touch ${
              isNavigating
                ? 'bg-slate-400 text-white cursor-not-allowed'
                : 'custom-button-primary hover:shadow-md'
            }`}
          >
            {getStatusIcon()}
            {isNavigating ? 'Opening Navigation...' : 'Get Directions'}
          </button>
          
          {/* Status Message */}
          {navigationStatus && (
            <div className={`text-xs text-center p-3 rounded-xl transition-all duration-300 ${getStatusColor()}`}>
              {navigationStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};