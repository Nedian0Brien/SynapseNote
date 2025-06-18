import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { FieldType, usePropertiesSelector } from '@/application/database-yjs';
import { useNavigationKey } from '@/components/database/components/conditions/useNavigationKey';
import { FieldDisplay } from '@/components/database/components/field';
import { dropdownMenuItemVariants } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/search-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function PropertiesMenu({
  open,
  onSelect,
  onOpenChange,
  searchPlaceholder,
  filteredOut,
  children,
  asChild,
}: {
  onSelect: (id: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  searchPlaceholder?: string;
  filteredOut?: string[];
  children?: React.ReactNode;
  asChild?: boolean;
}) {
  const { properties } = usePropertiesSelector(true);
  const [searchInput, setSearchInput] = useState('');

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      if (filteredOut?.includes(property.id)) {
        return false;
      }

      if (
        [FieldType.Relation, FieldType.AISummaries, FieldType.AITranslations, FieldType.FileMedia].includes(
          property.type
        )
      ) {
        return false;
      }

      return property.name.toLowerCase().includes(searchInput.toLowerCase());
    });
  }, [searchInput, properties, filteredOut]);

  const [element, setElement] = useState<HTMLElement | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onOpenChange?.(false);
    },
    [onOpenChange, onSelect]
  );

  const { selectedId, setSelectedId } = useNavigationKey({
    element,
    onToggleItemId: handleSelect,
  });

  useEffect(() => {
    if (!open) {
      setSearchInput('');
      setSelectedId(null);
    }
  }, [open, setSelectedId]);

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        asChild={asChild}
        className={cn(filteredProperties.length === 0 && filteredOut ? 'invisible' : 'visible', 'h-7')}
        disabled={filteredProperties.length === 0}
      >
        {children || <button className={'absolute left-0 top-0 z-[-1] h-full w-full'} />}
      </PopoverTrigger>
      <PopoverContent
        className={'p-2'}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div ref={setElement}>
          <SearchInput
            placeholder={searchPlaceholder}
            className={'mb-2 w-full'}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
          />
          <div className={'appflowy-scroller flex max-h-[320px] flex-col overflow-hidden overflow-y-auto '}>
            {filteredProperties.map((property) => (
              <div
                data-item-id={property.id}
                className={cn(
                  dropdownMenuItemVariants({ variant: 'default' }),
                  selectedId === property.id && 'bg-fill-content-hover'
                )}
                key={property.id}
                onClick={() => {
                  handleSelect(property.id);
                }}
                onMouseEnter={() => setSelectedId(property.id)}
              >
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger>
                    <FieldDisplay className={'max-w-[180px] flex-1 gap-[10px] truncate'} fieldId={property.id} />
                  </TooltipTrigger>
                  <TooltipContent side={'right'}>{property.name}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default PropertiesMenu;
