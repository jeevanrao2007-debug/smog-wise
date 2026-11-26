import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { CityLocation, GeocodingResult } from '../types';
import { PRESET_CITIES, toCitySlug } from '../utils/smogLogic';
import { sanitizePlainText } from '../utils/apiValidation';

// In-memory cache for geocoding queries (avoids repeat network fetches on backspace/typing)
const geocodingCache = new Map<string, GeocodingResult[]>();

interface CitySearchComboboxProps {
  onSelectCity: (city: CityLocation) => void;
}

export const CitySearchCombobox: React.FC<CitySearchComboboxProps> = ({
  onSelectCity,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number>(-1);

  const comboboxContainerRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        comboboxContainerRef.current &&
        !comboboxContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setActiveOptionIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  const executeGeocodingSearch = async (rawQuery: string) => {
    const trimmedQuery = sanitizePlainText(rawQuery, 60);
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    if (geocodingCache.has(cacheKey)) {
      setSearchResults(geocodingCache.get(cacheKey)!);
      setIsSearching(false);
      setShowDropdown(true);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setShowDropdown(true);
    setActiveOptionIndex(-1);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          trimmedQuery
        )}&count=5`,
        { signal: controller.signal }
      );
      if (response.ok) {
        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];
        if (geocodingCache.size > 100) geocodingCache.clear();
        geocodingCache.set(cacheKey, results);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const filtered = PRESET_CITIES.filter((c) =>
        c.name.toLowerCase().includes(trimmedQuery.toLowerCase())
      ).map((c, idx) => ({
        id: idx + 1,
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        country: c.country,
      }));
      setSearchResults(filtered);
    } finally {
      if (searchAbortRef.current === controller) {
        setIsSearching(false);
      }
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 2) {
      searchAbortRef.current?.abort();
      setSearchResults([]);
      setShowDropdown(false);
      setActiveOptionIndex(-1);
      setIsSearching(false);
      return;
    }

    setShowDropdown(true);
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      executeGeocodingSearch(trimmed);
    }, 250);
  };

  const handlePickResult = (item: GeocodingResult) => {
    onSelectCity({
      name: item.name,
      country: item.country,
      latitude: item.latitude,
      longitude: item.longitude,
      slug: toCitySlug(item.name),
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setActiveOptionIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveOptionIndex(-1);
      return;
    }

    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveOptionIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveOptionIndex((prev) =>
        prev > 0 ? prev - 1 : searchResults.length - 1
      );
    } else if (e.key === 'Enter' && activeOptionIndex >= 0) {
      e.preventDefault();
      const chosen = searchResults[activeOptionIndex];
      if (chosen) handlePickResult(chosen);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeOptionIndex >= 0 && searchResults[activeOptionIndex]) {
      handlePickResult(searchResults[activeOptionIndex]);
      return;
    }
    if (searchResults.length > 0) {
      handlePickResult(searchResults[0]);
    } else if (searchQuery.trim().length >= 2) {
      const match = PRESET_CITIES.find(
        (c) => c.name.toLowerCase() === searchQuery.trim().toLowerCase()
      );
      if (match) {
        onSelectCity(match);
        setSearchQuery('');
        setShowDropdown(false);
        setActiveOptionIndex(-1);
      }
    }
  };

  const activeDescendantId =
    showDropdown && activeOptionIndex >= 0 && searchResults[activeOptionIndex]
      ? `city-option-${searchResults[activeOptionIndex].id}`
      : undefined;

  return (
    <div ref={comboboxContainerRef} className="relative flex-1 sm:w-64">
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search
          className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="city-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeDescendantId}
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => {
            if (searchResults.length > 0) setShowDropdown(true);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search any city (e.g. Lahore)..."
          aria-label="Search city"
          className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-colors"
        />
      </form>

      {showDropdown && (
        <div
          id="city-search-listbox"
          role="listbox"
          aria-label="City search suggestions"
          className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {isSearching ? (
            <div role="status" className="px-4 py-3 text-xs text-slate-600">
              Searching Open-Meteo Geocoding...
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((item, idx) => {
              const isHighlighted = idx === activeOptionIndex;
              return (
                <button
                  key={item.id}
                  id={`city-option-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onClick={() => handlePickResult(item)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between border-b border-slate-100 last:border-b-0 cursor-pointer focus-visible:outline-none ${
                    isHighlighted
                      ? 'bg-emerald-50 text-emerald-950'
                      : 'hover:bg-slate-50 text-slate-900'
                  }`}
                >
                  <span className="font-medium truncate">{item.name}</span>
                  {item.country && (
                    <span className="text-xs text-slate-600 truncate ml-2">
                      {item.country}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div role="status" className="px-4 py-3 text-xs text-slate-600">
              No matching cities found. Try another query.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
