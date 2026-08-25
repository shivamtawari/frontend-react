import { INSTANCE_WRITE_MODES, MessageBuilders } from './messageTypes';

describe('MessageBuilders.runInstance', () => {
  test('defaults interactive inference to patch mode', () => {
    const message = MessageBuilders.runInstance('instance-model');

    expect(message.data).toEqual({
      model_registry_key: 'instance-model',
      write_mode: INSTANCE_WRITE_MODES.PATCH,
    });
  });

  test('preserves override mode in the websocket payload', () => {
    const message = MessageBuilders.runInstance(
      'instance-model',
      INSTANCE_WRITE_MODES.OVERRIDE
    );

    expect(message.data.write_mode).toBe('override');
  });
});

describe('MessageBuilders.runSuggestion', () => {
  test('builds payload without inputs when none provided', () => {
    const message = MessageBuilders.runSuggestion([10, 11], 'sam3-sugg', 2);

    expect(message.data).toEqual({
      seed_contour_ids: [10, 11],
      model_key: 'sam3-sugg',
      label_id: 2,
    });
  });

  test('includes inputs in websocket payload when provided', () => {
    const message = MessageBuilders.runSuggestion([10, 11], 'sam3-sugg', 2, {
      parameters: { mask_threshold: 0.8 },
      conditioning: { count: 4 },
    });

    expect(message.data).toEqual({
      seed_contour_ids: [10, 11],
      model_key: 'sam3-sugg',
      label_id: 2,
      inputs: {
        parameters: { mask_threshold: 0.8 },
        conditioning: { count: 4 },
      },
    });
  });
});
