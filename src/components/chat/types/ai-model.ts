/**
 * AI Model types matching the SynapseNote-Cloud-Premium API
 * Based on libs/synapsenote-entity/src/ai/dto.rs
 */

export interface ModelMetadata {
  is_default: boolean;
  desc: string;
}

export interface AvailableModel {
  name: string;
  provider?: string;
  metadata?: ModelMetadata;
}

export interface ModelList {
  models: AvailableModel[];
}

// Extended interface for UI display purposes
export interface ModelDisplayInfo extends AvailableModel {
  id: string;
  displayName: string;
  description: string;
}

// Helper function to convert API response to display format
export function toModelDisplayInfo(model: AvailableModel): ModelDisplayInfo {
  return {
    ...model,
    id: model.name.toLowerCase().replace(/\s+/g, '-'),
    displayName: model.name,
    description: model.metadata?.desc || '',
  };
}