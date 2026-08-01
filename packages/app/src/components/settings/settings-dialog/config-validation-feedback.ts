import {
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigValidationError,
  humanFormat,
  isKnownConfigError,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import type { FieldPath, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { subscribeToConfigValidationRejected } from '@/lib/config-validation-events';
import type { SettingsScope } from '../settings-types';
import { pickFirstIssueForPath } from '../use-config-form';

export function firstIssuePath(error: ConfigValidationError): string | null {
  if (!isKnownConfigError(error) || error.code !== 'SCHEMA_INVALID') return null;
  const first = error.issues[0];
  if (!first || first.path.length === 0) return null;
  return first.path.map(String).join('.');
}

/** Binds L3 validation events to the currently mounted schema panel. */
export function useConfigValidationFeedback(scope: SettingsScope, form: UseFormReturn<Config>) {
  const [flashedPath, setFlashedPath] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const docName = scope === 'project' ? CONFIG_DOC_NAME_PROJECT : CONFIG_DOC_NAME_USER;
    const unsubscribe = subscribeToConfigValidationRejected((event) => {
      if (event.docName !== docName) return;
      toast.error(humanFormat(event.error), { duration: 8000 });
      const path = firstIssuePath(event.error);
      if (!path) return;
      form.setError(path as FieldPath<Config>, {
        type: 'config-validation-rejected',
        message: pickFirstIssueForPath(event.error, path),
      });
      form.setFocus(path as FieldPath<Config>);
      setFlashedPath(path);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setFlashedPath(null);
        form.clearErrors(path as FieldPath<Config>);
      }, 600);
    });
    return () => {
      unsubscribe();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [scope, form]);
  return flashedPath;
}
