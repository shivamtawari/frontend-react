import { beforeEach, describe, expect, test } from 'vitest';

import useAnnotationStore from './useAnnotationStore';

/**
 * The contours for an image can arrive before that image becomes the current one.
 *
 * The websocket session is opened from the URL's image id and answered with
 * SESSION_INITIALIZED followed immediately by OBJECTS, while `DatasetLoader` is still
 * fetching the image list and the annotation queue over REST. Either can finish first,
 * which is why the failure is intermittent across reloads.
 *
 * If the contours arrive first, `setCurrentImage` must not wipe them: nothing re-requests
 * them, since the session is already pointed at that image, so the canvas would wait on the
 * loading state until its timeout.
 */
const hierarchy = {
  root_contours: [
    { id: 11, x: [0, 1, 2], y: [0, 1, 2], children: [] },
    { id: 12, x: [3, 4, 5], y: [3, 4, 5], children: [] },
  ],
};

const imageTwo = { id: 2, name: 'FL_S1_Ap_05_T0' };

describe('contours arriving before the image becomes current', () => {
  beforeEach(() => {
    useAnnotationStore.setState((state) => {
      state.images.currentImage = null;
      state.images.currentImageId = null;
      state.objects.list = [];
      state.objects.selected = [];
      state.objects.colors = {};
      state.objects.loading = false;
      state.objects.loadError = null;
      state.objects.loadedForImageId = null;
    });
  });

  test('are kept when that image is then made current', () => {
    const { setObjectsFromHierarchy, setCurrentImage } = useAnnotationStore.getState();

    // OBJECTS arrives first, tagged with the image the session asked for.
    setObjectsFromHierarchy(hierarchy, null, 2);
    expect(useAnnotationStore.getState().objects.list).toHaveLength(2);
    expect(useAnnotationStore.getState().objects.loading).toBe(false);

    // DatasetLoader finishes afterwards and makes that same image current.
    setCurrentImage(imageTwo);

    const { objects } = useAnnotationStore.getState();
    expect(objects.list).toHaveLength(2);
    expect(objects.loading).toBe(false);
  });

  test('are still wiped when a different image is made current', () => {
    const { setObjectsFromHierarchy, setCurrentImage } = useAnnotationStore.getState();

    setObjectsFromHierarchy(hierarchy, null, 2);
    setCurrentImage({ id: 7, name: 'FL_S1_Ap_07_T0' });

    const { objects } = useAnnotationStore.getState();
    expect(objects.list).toHaveLength(0);
    expect(objects.loading).toBe(true);
  });

  test('stepping from one image to the next still shows the spinner', () => {
    const { setObjectsFromHierarchy, setCurrentImage } = useAnnotationStore.getState();

    setCurrentImage(imageTwo);
    setObjectsFromHierarchy(hierarchy, null, 2);
    expect(useAnnotationStore.getState().objects.loading).toBe(false);

    setCurrentImage({ id: 3, name: 'FL_S1_Ap_06_T0' });

    const { objects } = useAnnotationStore.getState();
    expect(objects.list).toHaveLength(0);
    expect(objects.loading).toBe(true);
  });
});

describe('AI prompt state when the current image changes', () => {
  beforeEach(() => {
    useAnnotationStore.setState((state) => {
      state.images.currentImage = null;
      state.images.currentImageId = null;
      state.aiAnnotation.prompts = [];
      state.aiAnnotation.activePreview = null;
      state.aiAnnotation.undoStack = [];
      state.aiAnnotation.redoStack = [];
    });
  });

  test('clears prompt state for a different image but preserves it for the same image', () => {
    const {
      addBoxPrompt,
      addPointPrompt,
      redoLastAction,
      setActivePreview,
      setCurrentImage,
      undoLastAction,
    } = useAnnotationStore.getState();
    const imageOne = { id: 1, name: 'image-one' };
    const imageTwo = { id: 2, name: 'image-two' };

    setCurrentImage(imageOne);
    addPointPrompt(10, 20, 'positive');
    addBoxPrompt(1, 2, 3, 4);
    undoLastAction();
    redoLastAction();
    undoLastAction();
    setActivePreview({ mask: 'preview' });

    const beforeSameImage = structuredClone(useAnnotationStore.getState().aiAnnotation);
    setCurrentImage(imageOne);

    expect(useAnnotationStore.getState().aiAnnotation).toMatchObject({
      prompts: beforeSameImage.prompts,
      activePreview: beforeSameImage.activePreview,
      undoStack: beforeSameImage.undoStack,
      redoStack: beforeSameImage.redoStack,
    });

    setCurrentImage(imageTwo);

    expect(useAnnotationStore.getState().aiAnnotation).toMatchObject({
      prompts: [],
      activePreview: null,
      undoStack: [],
      redoStack: [],
    });
  });
});
