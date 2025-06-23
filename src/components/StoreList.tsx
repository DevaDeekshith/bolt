import React, { useState } from 'react';
import { Store, UserLocation } from '../types/store';
import { StoreCard } from './StoreCard';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface StoreListProps {
  stores: Store[];
  selectedStore?: Store;
  onStoreSelect: (store: Store) => void;
  onGetDirections: (store: Store) => void;
  userLocation?: UserLocation;
  isLoading?: boolean;
}

const INITIAL_DISPLAY_COUNT = 6;
const LOAD_MORE_COUNT = 6;

export const StoreList: React.FC<StoreListProps> = ({
  stores,
  selectedStore,
  onStoreSelect,
  onGetDirections,
  userLocation,
  isLoading = false
}) => {
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleShowMore = () => {
    const newCount = displayCount + LOAD_MORE_COUNT;
    setDisplayCount(newCount);
    setIsExpanded(newCount >= stores.length);
  };

  const handleShowLess = () => {
    setDisplayCount(INITIAL_DISPLAY_COUNT);
    setIsExpanded(false);
  };

  const displayedStores = stores.slice(0, displayCount);
  const hasMore = stores.length > displayCount;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="clean-glass rounded-2xl p-6 loading-shimmer">
            <div className="space-y-4">
              <div className="h-6 bg-white/40 rounded-xl w-3/4"></div>
              <div className="h-4 bg-white/30 rounded-lg w-1/2"></div>
              <div className="h-4 bg-white/30 rounded-lg w-2/3"></div>
              <div className="h-10 bg-white/40 rounded-xl w-32"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Store Cards */}
      <div className="space-y-4">
        {displayedStores.map((store, index) => (
          <div
            key={store.id}
            className="scale-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <StoreCard
              store={store}
              onGetDirections={onGetDirections}
              onSelectStore={onStoreSelect}
              isSelected={selectedStore?.id === store.id}
              userLocation={userLocation}
            />
          </div>
        ))}
      </div>

      {/* Load More / Show Less Controls */}
      {stores.length > INITIAL_DISPLAY_COUNT && (
        <div className="flex justify-center pt-4">
          {hasMore ? (
            <button
              onClick={handleShowMore}
              className="clean-button flex items-center gap-3 px-8 py-4 rounded-xl transition-all duration-300 hover:shadow-md mobile-touch"
            >
              <span className="font-medium">
                Show More ({stores.length - displayCount} remaining)
              </span>
              <ChevronDown className="w-5 h-5" />
            </button>
          ) : isExpanded ? (
            <button
              onClick={handleShowLess}
              className="clean-button flex items-center gap-3 px-8 py-4 rounded-xl transition-all duration-300 hover:shadow-md mobile-touch"
            >
              <span className="font-medium">Show Less</span>
              <ChevronUp className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Results Summary */}
      <div className="text-center text-sm text-muted pt-2">
        <div className="clean-button inline-flex items-center gap-2 px-4 py-2 rounded-xl">
          <span>
            Showing {displayedStores.length} of {stores.length} stores
            {stores.length > displayedStores.length && (
              <span className="ml-1 text-primary font-medium">
                • {stores.length - displayedStores.length} more available
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};