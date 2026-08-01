import { Trans } from '@lingui/react/macro';
import type {
  DatabaseBoardViewConfiguration,
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

/** Owns board card appearance and bounded loading controls. */
export function DatabaseSavedViewSettingsBoardPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseBoardViewConfiguration;
  onChange: (configuration: DatabaseBoardViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const cardPreview =
    configuration.cardPreview.type === 'files'
      ? `files:${configuration.cardPreview.propertyId}`
      : 'none';
  return (
    <section className="space-y-3" aria-label="Saved Board display settings">
      <strong>
        <Trans>Board cards and limits</Trans>
      </strong>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={configuration.cardSize}
          onValueChange={(cardSize) =>
            onChange({ ...configuration, cardSize: cardSize as typeof configuration.cardSize })
          }
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Board card size">
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
          <SelectTrigger size="sm" className="min-w-44" aria-label="Board card preview">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No card cover</SelectItem>
            {source.properties
              .filter((property) => property.type === 'files')
              .map((property) => (
                <SelectItem key={property.id} value={`files:${property.id}`}>
                  {property.name} cover
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={configuration.fitImage}
            disabled={cardPreview === 'none'}
            aria-label="Fit Board card cover"
            onCheckedChange={(checked) =>
              onChange({ ...configuration, fitImage: checked === true })
            }
          />
          <Trans>Fit cover</Trans>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={configuration.colorColumns}
            aria-label="Color Board columns"
            onCheckedChange={(checked) =>
              onChange({ ...configuration, colorColumns: checked === true })
            }
          />
          <Trans>Color columns</Trans>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="board-group-limit" className="space-y-1 text-xs">
          <span>Maximum groups</span>
          <Input
            id="board-group-limit"
            type="number"
            min={1}
            max={500}
            value={configuration.groupLimit}
            aria-label="Board group limit"
            onChange={(event) =>
              onChange({ ...configuration, groupLimit: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label htmlFor="board-card-limit" className="space-y-1 text-xs">
          <span>Cards shown per group</span>
          <Input
            id="board-card-limit"
            type="number"
            min={1}
            max={500}
            value={configuration.cardLimitPerGroup}
            aria-label="Board cards per group limit"
            onChange={(event) =>
              onChange({ ...configuration, cardLimitPerGroup: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
    </section>
  );
}
