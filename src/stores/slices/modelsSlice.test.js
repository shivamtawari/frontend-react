import { getInstanceModels } from '../../api/instance_segmentation';
import useAnnotationStore from '../useAnnotationStore';

jest.mock('../../api/instance_segmentation', () => ({
  getInstanceModels: jest.fn(),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('instance-model dataset catalog', () => {
  beforeEach(() => {
    getInstanceModels.mockReset();
    useAnnotationStore.setState((state) => ({
      models: {
        ...state.models,
        availableInstanceModels: [],
        instanceModel: null,
        instanceModelsRequestId: 0,
        isLoadingInstanceModels: false,
        favorites: {},
        favoritesLoaded: true,
      },
    }));
  });

  it('keeps the newest dataset catalog when an older request finishes last', async () => {
    const datasetOne = deferred();
    const datasetTwo = deferred();
    getInstanceModels.mockImplementation((datasetId) => (
      datasetId === '1' ? datasetOne.promise : datasetTwo.promise
    ));

    const firstRequest = useAnnotationStore.getState().fetchAvailableInstanceModels('1');
    const secondRequest = useAnnotationStore.getState().fetchAvailableInstanceModels('2');

    datasetTwo.resolve({
      success: true,
      result: [{ registry_key: 'dataset-2-model', name: 'Dataset 2 model' }],
    });
    await secondRequest;

    datasetOne.resolve({
      success: true,
      result: [{ registry_key: 'dataset-1-model', name: 'Dataset 1 model' }],
    });
    await firstRequest;

    expect(getInstanceModels).toHaveBeenNthCalledWith(1, '1');
    expect(getInstanceModels).toHaveBeenNthCalledWith(2, '2');
    expect(useAnnotationStore.getState().models.availableInstanceModels).toEqual([
      expect.objectContaining({ id: 'dataset-2-model' }),
    ]);
    expect(useAnnotationStore.getState().models.instanceModel).toBe('dataset-2-model');
  });
});
