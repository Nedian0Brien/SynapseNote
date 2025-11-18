import { AFService, AFServiceConfig } from '@/application/services/services.type';

import { AFClientService } from './js-services';

let service: AFService;

export function getService (config: AFServiceConfig) {
  if (service) return service;

  service = new AFClientService(config);
  return service;
}
