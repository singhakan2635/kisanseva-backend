import { Crop } from '../../models/Crop';

const validCrop = {
  name: 'Rice',
  nameHi: 'चावल',
  scientificName: 'Oryza sativa',
  category: 'cereal' as const,
  growingSeason: 'kharif' as const,
  description: 'Staple food crop',
  commonRegions: ['Punjab', 'West Bengal', 'Andhra Pradesh'],
};

describe('Crop Model', () => {
  it('should create a valid crop', async () => {
    const crop = await Crop.create(validCrop);

    expect(crop.name).toBe(validCrop.name);
    expect(crop.nameHi).toBe(validCrop.nameHi);
    expect(crop.scientificName).toBe(validCrop.scientificName);
    expect(crop.category).toBe(validCrop.category);
    expect(crop.growingSeason).toBe(validCrop.growingSeason);
    expect(crop.commonRegions).toEqual(validCrop.commonRegions);
    expect(crop.createdAt).toBeDefined();
    expect(crop.updatedAt).toBeDefined();
  });

  it('should require name field', async () => {
    const { name, ...cropWithoutName } = validCrop;
    await expect(Crop.create(cropWithoutName)).rejects.toThrow();
  });

  it('should require category field', async () => {
    const { category, ...cropWithoutCategory } = validCrop;
    await expect(Crop.create(cropWithoutCategory)).rejects.toThrow();
  });

  it('should require growingSeason field', async () => {
    const { growingSeason, ...cropWithoutSeason } = validCrop;
    await expect(Crop.create(cropWithoutSeason)).rejects.toThrow();
  });

  it('should reject invalid category enum value', async () => {
    await expect(
      Crop.create({ ...validCrop, name: 'TestCrop', category: 'invalid_category' })
    ).rejects.toThrow();
  });

  it('should reject invalid growingSeason enum value', async () => {
    await expect(
      Crop.create({ ...validCrop, name: 'TestCrop2', growingSeason: 'invalid_season' })
    ).rejects.toThrow();
  });

  it('should transform toJSON correctly', async () => {
    const crop = await Crop.create(validCrop);
    const json = crop.toJSON();

    expect(json.id).toBeDefined();
    expect((json as Record<string, unknown>)._id).toBeUndefined();
    expect((json as Record<string, unknown>).__v).toBeUndefined();
  });
});
