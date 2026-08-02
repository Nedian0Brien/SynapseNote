import type { DatabaseProperty, DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import { useRef, useState } from 'react';
import type { DatabaseTableCellEditing } from './database-table-cell-types';
import type { DatabaseCellMenu, DatabaseRowMenu } from './database-table-types';
import type { DatabaseCellRange } from './database-table-utils';

/** Owns transient interaction targets that must survive data-only revisions. */
export function useDatabaseTableInteractionState() {
  const [editing, setEditing] = useState<DatabaseTableCellEditing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState('New property');
  const [newPropertyType, setNewPropertyType] = useState<DatabasePropertyType>('text');
  const [propertyInsertTarget, setPropertyInsertTarget] = useState<{
    propertyId: string;
    position: 'before' | 'after';
  } | null>(null);
  const [propertyRenameTarget, setPropertyRenameTarget] = useState<DatabaseProperty | null>(null);
  const [propertyRenameDraft, setPropertyRenameDraft] = useState('');
  const [cellRange, setCellRange] = useState<DatabaseCellRange | null>(null);
  const [gridAnnouncement, setGridAnnouncement] = useState('');
  const [cellMenu, setCellMenu] = useState<DatabaseCellMenu | null>(null);
  const [rowMenu, setRowMenu] = useState<DatabaseRowMenu | null>(null);
  const cellMenuRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const editFocusRef = useRef<{ recordId: string; propertyId: string } | null>(null);

  return {
    editing,
    setEditing,
    editError,
    setEditError,
    addPropertyOpen,
    setAddPropertyOpen,
    newPropertyName,
    setNewPropertyName,
    newPropertyType,
    setNewPropertyType,
    propertyInsertTarget,
    setPropertyInsertTarget,
    propertyRenameTarget,
    setPropertyRenameTarget,
    propertyRenameDraft,
    setPropertyRenameDraft,
    cellRange,
    setCellRange,
    gridAnnouncement,
    setGridAnnouncement,
    cellMenu,
    setCellMenu,
    rowMenu,
    setRowMenu,
    cellMenuRef,
    rowMenuRef,
    editFocusRef,
  };
}
