import { Trans } from '@lingui/react/macro';
import type {
  DatabasePageLayout,
  DatabasePageLayoutSection,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { DatabasePageLayoutSchema } from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Placement = 'pinned' | 'panel' | 'hidden' | `group:${string}`;

function token(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 20).toLowerCase();
}

function move<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function initialLayout(source: DatabaseSource): DatabasePageLayout {
  return (
    source.pageLayout ?? {
      pinnedPropertyIds: [],
      panelPropertyIds: source.properties
        .filter((property) => property.type !== 'title')
        .map((property) => property.id),
      hiddenPropertyIds: [],
      sections: [],
      fullWidthContent: false,
    }
  );
}

function placements(layout: DatabasePageLayout): Record<string, Placement> {
  const result: Record<string, Placement> = {};
  for (const propertyId of layout.pinnedPropertyIds) result[propertyId] = 'pinned';
  for (const propertyId of layout.panelPropertyIds) result[propertyId] = 'panel';
  for (const propertyId of layout.hiddenPropertyIds) result[propertyId] = 'hidden';
  for (const section of layout.sections) {
    for (const group of section.groups) {
      for (const propertyId of group.propertyIds) result[propertyId] = `group:${group.id}`;
    }
  }
  return result;
}

export function DatabasePageLayoutDialog({
  open,
  onOpenChange,
  source,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  onSave: (layout: DatabasePageLayout) => void;
}) {
  'use no memo';
  const starting = initialLayout(source);
  const properties = source.properties.filter((property) => property.type !== 'title');
  const [sections, setSections] = useState<DatabasePageLayoutSection[]>(() =>
    structuredClone(starting.sections),
  );
  const [placementByProperty, setPlacementByProperty] = useState<Record<string, Placement>>(() => {
    const configured = placements(starting);
    return Object.fromEntries(
      properties.map((property) => [property.id, configured[property.id] ?? 'panel']),
    );
  });
  const [fullWidthContent, setFullWidthContent] = useState(starting.fullWidthContent);
  const [error, setError] = useState<string | null>(null);

  function addSection() {
    const sectionToken = token();
    const groupToken = token();
    setSections((current) => [
      ...current,
      {
        id: `layout_section_${sectionToken}`,
        key: `section_${sectionToken}`,
        name: 'New section',
        groups: [
          {
            id: `layout_group_${groupToken}`,
            key: `group_${groupToken}`,
            name: 'New group',
            propertyIds: [],
            collapsed: false,
          },
        ],
      },
    ]);
  }

  function removeSection(sectionId: string) {
    const groupIds = new Set(
      sections.find((section) => section.id === sectionId)?.groups.map((group) => group.id) ?? [],
    );
    setPlacementByProperty((current) =>
      Object.fromEntries(
        Object.entries(current).map(([propertyId, placement]) => [
          propertyId,
          placement.startsWith('group:') && groupIds.has(placement.slice(6)) ? 'panel' : placement,
        ]),
      ),
    );
    setSections((current) => current.filter((section) => section.id !== sectionId));
  }

  function addGroup(sectionId: string) {
    const groupToken = token();
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              groups: [
                ...section.groups,
                {
                  id: `layout_group_${groupToken}`,
                  key: `group_${groupToken}`,
                  name: 'New group',
                  propertyIds: [],
                  collapsed: false,
                },
              ],
            }
          : section,
      ),
    );
  }

  function removeGroup(sectionId: string, groupId: string) {
    setPlacementByProperty((current) =>
      Object.fromEntries(
        Object.entries(current).map(([propertyId, placement]) => [
          propertyId,
          placement === `group:${groupId}` ? 'panel' : placement,
        ]),
      ),
    );
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, groups: section.groups.filter((group) => group.id !== groupId) }
          : section,
      ),
    );
  }

  function save() {
    setError(null);
    const propertyIds = (placement: Placement) =>
      properties
        .filter((property) => placementByProperty[property.id] === placement)
        .map((property) => property.id);
    const candidate = {
      pinnedPropertyIds: propertyIds('pinned'),
      panelPropertyIds: propertyIds('panel'),
      hiddenPropertyIds: propertyIds('hidden'),
      sections: sections
        .map((section) => ({
          ...section,
          name: section.name.trim(),
          groups: section.groups
            .map((group) => ({
              ...group,
              name: group.name.trim(),
              propertyIds: propertyIds(`group:${group.id}`),
            }))
            .filter((group) => group.propertyIds.length > 0),
        }))
        .filter((section) => section.groups.length > 0),
      fullWidthContent,
    };
    const parsed = DatabasePageLayoutSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid page layout');
      return;
    }
    onSave(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Customize record layout</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Place stable database properties in pinned, panel, hidden, section, or group regions.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 overflow-y-auto">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label="Use full-width page content"
              checked={fullWidthContent}
              onCheckedChange={(checked) => setFullWidthContent(checked === true)}
            />
            <Trans>Use full-width page content</Trans>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-sm">
              <Trans>Property placement</Trans>
            </h3>
            {properties.map((property) => (
              <div key={property.id} className="grid grid-cols-[1fr_minmax(12rem,1fr)] gap-3">
                <span className="self-center text-sm">{property.name}</span>
                <Select
                  value={placementByProperty[property.id] ?? 'panel'}
                  onValueChange={(value) =>
                    setPlacementByProperty((current) => ({
                      ...current,
                      [property.id]: value as Placement,
                    }))
                  }
                >
                  <SelectTrigger aria-label={`${property.name} placement`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinned">Pinned</SelectItem>
                    <SelectItem value="panel">Panel</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                    {sections.flatMap((section) =>
                      section.groups.map((group) => (
                        <SelectItem key={group.id} value={`group:${group.id}`}>
                          {section.name} / {group.name}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">
                <Trans>Sections and groups</Trans>
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={addSection}>
                <Plus /> <Trans>Add section</Trans>
              </Button>
            </div>
            {sections.map((section, sectionIndex) => (
              <div key={section.id} className="space-y-2 rounded border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Section name"
                    value={section.name}
                    onChange={(event) =>
                      setSections((current) =>
                        current.map((candidate) =>
                          candidate.id === section.id
                            ? { ...candidate, name: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move section up"
                    disabled={sectionIndex === 0}
                    onClick={() => setSections((current) => move(current, sectionIndex, -1))}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move section down"
                    disabled={sectionIndex === sections.length - 1}
                    onClick={() => setSections((current) => move(current, sectionIndex, 1))}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete section"
                    onClick={() => removeSection(section.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {section.groups.map((group, groupIndex) => (
                  <div key={group.id} className="flex items-center gap-2 pl-4">
                    <Input
                      aria-label="Group name"
                      value={group.name}
                      onChange={(event) =>
                        setSections((current) =>
                          current.map((candidate) =>
                            candidate.id === section.id
                              ? {
                                  ...candidate,
                                  groups: candidate.groups.map((item) =>
                                    item.id === group.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <div className="flex items-center gap-1 text-xs">
                      <Checkbox
                        aria-label={`${group.name} collapsed`}
                        checked={group.collapsed}
                        onCheckedChange={(checked) =>
                          setSections((current) =>
                            current.map((candidate) =>
                              candidate.id === section.id
                                ? {
                                    ...candidate,
                                    groups: candidate.groups.map((item) =>
                                      item.id === group.id
                                        ? { ...item, collapsed: checked === true }
                                        : item,
                                    ),
                                  }
                                : candidate,
                            ),
                          )
                        }
                      />
                      <Trans>Collapsed</Trans>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Move group up"
                      disabled={groupIndex === 0}
                      onClick={() =>
                        setSections((current) =>
                          current.map((candidate) =>
                            candidate.id === section.id
                              ? { ...candidate, groups: move(candidate.groups, groupIndex, -1) }
                              : candidate,
                          ),
                        )
                      }
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Move group down"
                      disabled={groupIndex === section.groups.length - 1}
                      onClick={() =>
                        setSections((current) =>
                          current.map((candidate) =>
                            candidate.id === section.id
                              ? { ...candidate, groups: move(candidate.groups, groupIndex, 1) }
                              : candidate,
                          ),
                        )
                      }
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete group"
                      onClick={() => removeGroup(section.id, group.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addGroup(section.id)}
                >
                  <Plus /> <Trans>Add group</Trans>
                </Button>
              </div>
            ))}
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="button" onClick={save}>
            <Trans>Review layout change</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
