import * as path from 'path';
import { DatabaseService } from '../../src/database/database.service';
import { LocationRepository } from '../../src/database/repositories/location.repository';

describe('LocationRepository', () => {
  let database: DatabaseService;
  let repository: LocationRepository;

  beforeEach(() => {
    process.env.DATABASE_PATH = path.join(
      '/tmp',
      `loc-repo-${Date.now()}-${Math.random()}.db`,
    );
    database = new DatabaseService();
    database.onModuleInit();
    repository = new LocationRepository(database);
  });

  afterEach(() => {
    database.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  });

  it('creates and finds locations by id and hcm id', () => {
    const created = repository.create({
      id: 'loc_1',
      hcmLocationId: 'hcm_loc_1',
      name: 'HQ',
    });

    expect(repository.findById('loc_1')?.name).toBe('HQ');
    expect(repository.findByHcmId('hcm_loc_1')?.id).toBe(created.id);
  });

  it('updates existing locations on upsert', () => {
    repository.create({
      id: 'loc_1',
      hcmLocationId: 'hcm_loc_1',
      name: 'Old Name',
    });

    const updated = repository.upsert({
      hcmLocationId: 'hcm_loc_1',
      name: 'New Name',
    });

    expect(updated.id).toBe('loc_1');
    expect(updated.name).toBe('New Name');
  });

  it('creates a new location when upsert target is missing', () => {
    const created = repository.upsert({
      hcmLocationId: 'hcm_loc_new',
      name: 'Branch',
    });
    expect(created.name).toBe('Branch');
    expect(repository.findByHcmId('hcm_loc_new')?.id).toBe(created.id);
  });
});
