import { renderHook, act } from '@testing-library/react';
import useAppStore from './useAppStore';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.setState({
      datasets: { list: [], current: null, loading: false, error: null },
      ui: { loading: false, error: null, successMessage: null },
      downloads: { isCreatingDataset: false, isCreatingCSV: false, error: null }
    });
  });

  test('initial state is correct', () => {
    const { result } = renderHook(() => useAppStore());
    
    expect(result.current.datasets).toEqual({
      list: [],
      current: null,
      loading: false,
      error: null
    });
    
    expect(result.current.downloads).toEqual({
      isCreatingDataset: false,
      isCreatingCSV: false,
      error: null
    });
  });

  test('download actions work correctly', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.downloadActions.setCreatingDataset(true);
    });
    
    expect(result.current.downloads.isCreatingDataset).toBe(true);
    
    act(() => {
      result.current.downloadActions.setCreatingCSV(true);
    });
    
    expect(result.current.downloads.isCreatingCSV).toBe(true);
    
    act(() => {
      result.current.downloadActions.clearDownloadState();
    });
    
    expect(result.current.downloads.isCreatingDataset).toBe(false);
    expect(result.current.downloads.isCreatingCSV).toBe(false);
  });

  test('dataset actions work correctly', () => {
    const { result } = renderHook(() => useAppStore());
    const mockDataset = { id: 1, name: 'Test Dataset' };
    
    act(() => {
      result.current.datasetActions.setDatasets([mockDataset]);
    });
    
    expect(result.current.datasets.list).toEqual([mockDataset]);
    
    act(() => {
      result.current.datasetActions.setCurrentDataset(mockDataset);
    });
    
    expect(result.current.datasets.current).toEqual(mockDataset);
  });

  test('gallery actions manage request generation and dataset switching', () => {
    const { result } = renderHook(() => useAppStore());

    expect(result.current.gallery.requestGeneration).toBe(0);

    let gen1;
    act(() => {
      gen1 = result.current.galleryActions.nextRequestGeneration();
    });
    expect(gen1).toBe(1);
    expect(result.current.gallery.requestGeneration).toBe(1);
    expect(result.current.galleryActions.getRequestGeneration()).toBe(1);
    expect(result.current.gallery.labelsLoaded).toBe(false);
    expect(result.current.gallery.statsLoaded).toBe(false);

    act(() => {
      result.current.galleryActions.setCurrentDataset({ id: 10, name: 'Dataset 10' });
      result.current.galleryActions.setImages([{ id: 1, name: 'img1.png' }]);
      result.current.galleryActions.setLabels(['Colony']);
      result.current.galleryActions.setStats({ total: 1 });
    });

    expect(result.current.gallery.images).toHaveLength(1);
    expect(result.current.gallery.labels).toEqual(['Colony']);
    expect(result.current.gallery.stats).toEqual({ total: 1 });
    expect(result.current.gallery.labelsLoaded).toBe(true);
    expect(result.current.gallery.statsLoaded).toBe(true);

    // Switching to a different dataset bumps requestGeneration and clears cached items
    const beforeSwitchGen = result.current.gallery.requestGeneration;
    act(() => {
      result.current.galleryActions.setCurrentDataset({ id: 20, name: 'Dataset 20' });
    });

    expect(result.current.gallery.currentDataset.id).toBe(20);
    expect(result.current.gallery.images).toEqual([]);
    expect(result.current.gallery.labels).toEqual([]);
    expect(result.current.gallery.stats).toEqual({});
    expect(result.current.gallery.labelsLoaded).toBe(false);
    expect(result.current.gallery.statsLoaded).toBe(false);
    expect(result.current.gallery.requestGeneration).toBeGreaterThan(beforeSwitchGen);

    // Setting the same dataset again does NOT clear images or bump generation unnecessarily
    act(() => {
      result.current.galleryActions.setImages([{ id: 2, name: 'img2.png' }]);
    });
    const sameGen = result.current.gallery.requestGeneration;
    act(() => {
      result.current.galleryActions.setCurrentDataset({ id: 20, name: 'Dataset 20' });
    });
    expect(result.current.gallery.images).toHaveLength(1);
    expect(result.current.gallery.requestGeneration).toBe(sameGen);

    // advancing generation with dataset ownership check
    let validGen;
    act(() => {
      validGen = result.current.galleryActions.nextRequestGeneration(20);
    });
    expect(validGen).toBe(sameGen + 1);
    expect(result.current.gallery.requestGeneration).toBe(sameGen + 1);

    // advancing generation for a different dataset must NOT bump requestGeneration
    let invalidGen;
    act(() => {
      invalidGen = result.current.galleryActions.nextRequestGeneration(999);
    });
    expect(invalidGen).toBeNull();
    expect(result.current.gallery.requestGeneration).toBe(sameGen + 1);

    // switching dataset clears loadingData
    act(() => {
      result.current.galleryActions.setLoadingData(true);
      result.current.galleryActions.setCurrentDataset({ id: 30, name: 'Dataset 30' });
    });
    expect(result.current.gallery.loadingData).toBe(false);
  });
});
