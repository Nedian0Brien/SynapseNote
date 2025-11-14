import { generateUUID } from '@/application/database-yjs';
import { SelectOption, SelectOptionColor } from '../select-option';

export interface ChecklistCellData {
  selectedOptionIds?: string[];
  options?: SelectOption[];
  percentage: number;
}

function normalizeChecklistOptions(options: SelectOption[] = []) {
  return options.filter((option): option is SelectOption => Boolean(option && option.id));
}

export function parseChecklistData(data: string): ChecklistCellData | null {
  try {
    const { options, selected_option_ids } = JSON.parse(data);
    const percentage = selected_option_ids.length / options.length;

    return {
      percentage,
      options,
      selectedOptionIds: selected_option_ids,
    };
  } catch (e) {
    return null;
  }
}

export function addTask(data: string, taskName: string): string {
  const parsedData = parseChecklistData(data);

  const task: SelectOption = {
    id: generateUUID(),
    name: taskName,
    color: SelectOptionColor.OptionColor1,
  };

  if (!parsedData) {
    return JSON.stringify({
      options: [task],
      selected_option_ids: [],
    });
  }

  const { options = [], selectedOptionIds } = parsedData;
  const normalizedOptions = normalizeChecklistOptions(options);

  if (normalizedOptions.find((option) => option.id === task.id)) {
    return data;
  }

  return JSON.stringify({
    options: [...normalizedOptions, task],
    selected_option_ids: selectedOptionIds,
  });
}

export function toggleSelectedTask(data: string, taskId: string): string {
  const parsedData = parseChecklistData(data);

  if (!parsedData) {
    return data;
  }

  const { options, selectedOptionIds = [] } = parsedData;
  const normalizedOptions = normalizeChecklistOptions(options);

  const isSelected = selectedOptionIds.includes(taskId);
  const newSelectedOptionIds = isSelected
    ? selectedOptionIds.filter((id) => id !== taskId)
    : [...selectedOptionIds, taskId];

  return JSON.stringify({
    options: normalizedOptions,
    selected_option_ids: newSelectedOptionIds,
  });
}

export function updateTask(data: string, taskId: string, taskName: string): string {
  const parsedData = parseChecklistData(data);

  if (!parsedData) {
    return data;
  }

  const { options = [], selectedOptionIds } = parsedData;
  const normalizedOptions = normalizeChecklistOptions(options);

  const newOptions = normalizedOptions.map((option) => {
    if (option.id === taskId) {
      return {
        ...option,
        name: taskName,
      };
    }

    return option;
  });

  return JSON.stringify({
    options: newOptions,
    selected_option_ids: selectedOptionIds,
  });
}

export function removeTask(data: string, taskId: string): string {
  const parsedData = parseChecklistData(data);

  if (!parsedData) {
    return data;
  }

  const { options = [], selectedOptionIds = [] } = parsedData;
  const normalizedOptions = normalizeChecklistOptions(options);

  const newOptions = normalizedOptions.filter((option) => option.id !== taskId);
  const newSelectedOptionIds = selectedOptionIds.filter((id) => id !== taskId);

  return JSON.stringify({
    options: newOptions,
    selected_option_ids: newSelectedOptionIds,
  });
}

export function reorderTasks(data: string, { beforeId, taskId }: { beforeId?: string, taskId: string }): string {
  const parsedData = parseChecklistData(data);

  if (!parsedData) {
    return data;
  }

  const { selectedOptionIds, options = [] } = parsedData;
  const normalizedOptions = normalizeChecklistOptions(options);

  const index = normalizedOptions.findIndex((opt) => opt.id === taskId);
  const option = normalizedOptions[index];

  if (index === -1) {
    return data;
  }

  const newOptions = [...normalizedOptions];
  const beforeIndex = newOptions.findIndex((opt) => opt.id === beforeId);

  if (beforeIndex === index) {
    return data;
  }

  newOptions.splice(index, 1);

  if (beforeId === undefined || beforeIndex === -1) {
    newOptions.unshift(option);
  } else {
    const targetIndex = beforeIndex > index ? beforeIndex - 1 : beforeIndex;

    newOptions.splice(targetIndex + 1, 0, option);
  }

  return JSON.stringify({
    options: newOptions,
    selected_option_ids: selectedOptionIds,
  });
}
