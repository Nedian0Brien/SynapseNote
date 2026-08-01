import { Trans } from '@lingui/react/macro';
import type {
  DatabaseGalleryViewConfiguration,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns gallery card, media, fallback, and bounded-loading controls. */
export function DatabaseSavedViewSettingsGalleryPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseGalleryViewConfiguration;
  onChange: (configuration: DatabaseGalleryViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const cardPreview =
    configuration.cardPreview.type === 'files'
      ? `files:${configuration.cardPreview.propertyId}`
      : 'none';
  return (
    <section className="space-y-3" aria-label="Saved Gallery display settings">
      <strong>
        <Trans>Gallery cards and media</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={configuration.cardSize}
          onValueChange={(cardSize) =>
            onChange({ ...configuration, cardSize: cardSize as typeof configuration.cardSize })
          }
        >
          <SelectTrigger size="sm" aria-label="Gallery card size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small cards</SelectItem>
            <SelectItem value="medium">Medium cards</SelectItem>
            <SelectItem value="large">Large cards</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={cardPreview}
          onValueChange={(value) =>
            onChange({
              ...configuration,
              cardPreview:
                value === 'none'
                  ? { type: 'none' }
                  : { type: 'files', propertyId: value.slice('files:'.length) },
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Gallery card preview">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No media property</SelectItem>
            {source.properties
              .filter((property) => property.type === 'files')
              .map((property) => (
                <SelectItem key={property.id} value={`files:${property.id}`}>
                  {property.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={configuration.fallbackStyle}
          onValueChange={(fallbackStyle) =>
            onChange({
              ...configuration,
              fallbackStyle: fallbackStyle as typeof configuration.fallbackStyle,
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Gallery fallback art">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="color">Color fallback</SelectItem>
            <SelectItem value="document">Document fallback</SelectItem>
          </SelectContent>
        </Select>
        <label htmlFor="gallery-load-limit" className="space-y-1 text-xs">
          <span>Load limit</span>
          <Input
            id="gallery-load-limit"
            type="number"
            min={1}
            max={500}
            value={configuration.loadLimit}
            aria-label="Gallery load limit"
            onChange={(event) =>
              onChange({ ...configuration, loadLimit: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={configuration.fitImage}
            disabled={cardPreview === 'none'}
            aria-label="Fit Gallery image"
            onCheckedChange={(checked) =>
              onChange({ ...configuration, fitImage: checked === true })
            }
          />
          <Trans>Fit image</Trans>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={configuration.showTitle}
            aria-label="Show Gallery title"
            onCheckedChange={(checked) =>
              onChange({ ...configuration, showTitle: checked === true })
            }
          />
          <Trans>Show title</Trans>
        </div>
      </div>
    </section>
  );
}
