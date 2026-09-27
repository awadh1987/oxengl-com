import { useState, useMemo, useCallback } from 'react';

export interface UseBulkSelectionOptions<T = string> {
  getItemId?: (item: any) => T;
}

export interface UseBulkSelectionReturn<T extends string | number = string> {
  selectedIds: T[];
  isSelected: (id: T) => boolean;
  toggleSelect: (id: T) => void;
  toggleSelectAll: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  selectedCount: number;
  setSelectedIds: React.Dispatch<React.SetStateAction<T[]>>;
}

/**
 * Standardized hook for managing multi-record select state across platform
 * and tenant workspace data grids.
 */
export function useBulkSelection<T extends string | number = string>(
  items: any[] = [],
  options?: UseBulkSelectionOptions<T>
): UseBulkSelectionReturn<T> {
  const [selectedIds, setSelectedIds] = useState<T[]>([]);

  const getItemId = useCallback(
    (item: any): T => {
      if (options?.getItemId) {
        return options.getItemId(item);
      }
      if (typeof item === 'object' && item !== null) {
        return (item.id ?? item._id ?? item.uuid) as T;
      }
      return item as T;
    },
    [options]
  );

  const allItemIds = useMemo(() => {
    return items.map(getItemId).filter((id): id is T => id !== undefined && id !== null);
  }, [items, getItemId]);

  const isSelected = useCallback(
    (id: T) => selectedIds.includes(id),
    [selectedIds]
  );

  const toggleSelect = useCallback(
    (id: T) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    []
  );

  const isAllSelected = useMemo(() => {
    if (allItemIds.length === 0) return false;
    return allItemIds.every((id) => selectedIds.includes(id));
  }, [allItemIds, selectedIds]);

  const isIndeterminate = useMemo(() => {
    if (allItemIds.length === 0 || selectedIds.length === 0) return false;
    const selectedInCurrent = allItemIds.filter((id) => selectedIds.includes(id));
    return selectedInCurrent.length > 0 && selectedInCurrent.length < allItemIds.length;
  }, [allItemIds, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allItemIds.length === 0) return [];
      const allSelected = allItemIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !allItemIds.includes(id));
      } else {
        const newSelected = [...prev];
        allItemIds.forEach((id) => {
          if (!newSelected.includes(id)) {
            newSelected.push(id);
          }
        });
        return newSelected;
      }
    });
  }, [allItemIds]);

  const selectAll = useCallback(() => {
    setSelectedIds(allItemIds);
  }, [allItemIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return {
    selectedIds,
    isSelected,
    toggleSelect,
    toggleSelectAll,
    selectAll,
    clearSelection,
    isAllSelected,
    isIndeterminate,
    selectedCount: selectedIds.length,
    setSelectedIds,
  };
}
