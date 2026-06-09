import { PersistenceInfoService } from '../../src/database/persistence-info.service';
import { MemoryStore } from '../../src/database/memory/memory-store';
import { DatabaseService } from '../../src/database/database.service';

jest.mock('../../src/database/persistence-mode', () => ({
  resolvePersistenceMode: jest.fn(),
}));

import { resolvePersistenceMode } from '../../src/database/persistence-mode';

describe('PersistenceInfoService', () => {
  it('reports memory mode health from store presence', () => {
    (resolvePersistenceMode as jest.Mock).mockReturnValue('memory');
    const service = new PersistenceInfoService(undefined, new MemoryStore());
    expect(service.getMode()).toBe('memory');
    expect(service.isHealthy()).toBe(true);
  });

  it('delegates sqlite reset and health checks', () => {
    (resolvePersistenceMode as jest.Mock).mockReturnValue('sqlite');
    const database = {
      isHealthy: jest.fn().mockReturnValue(true),
      resetForTests: jest.fn(),
    } as unknown as DatabaseService;
    const service = new PersistenceInfoService(database);
    expect(service.isHealthy()).toBe(true);
    service.resetForTests();
    expect(database.resetForTests).toHaveBeenCalled();
  });
});
